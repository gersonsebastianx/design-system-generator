// Design System Generator — Figma Plugin
// Runs entirely inside Figma using the Plugin API. No external services, no build step.

figma.showUI(__html__, { width: 420, height: 640 });

// ---------- Color helpers ----------

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const int = parseInt(hex, 16);
  return { r: (int >> 16 & 255) / 255, g: (int >> 8 & 255) / 255, b: (int & 255) / 255 };
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r, g, b };
}

// step -> target lightness (relative position in a 50..900 ramp)
const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const RAMP_LIGHTNESS = [0.97, 0.94, 0.87, 0.78, 0.68, 0.58, 0.48, 0.39, 0.30, 0.20];

function generateRamp(hex) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const boostedS = Math.min(1, s * 1.05 + 0.03);
  const ramp = {};
  RAMP_STEPS.forEach((step, i) => {
    const rgb = hslToRgb(h, boostedS, RAMP_LIGHTNESS[i]);
    ramp[step] = rgb;
  });
  return ramp;
}

function mix(rgbA, rgbB, t) {
  return {
    r: rgbA.r + (rgbB.r - rgbA.r) * t,
    g: rgbA.g + (rgbB.g - rgbA.g) * t,
    b: rgbA.b + (rgbB.b - rgbA.b) * t,
  };
}

// ---------- Main generation ----------

async function loadFonts(fontFamily) {
  const styles = ['Regular', 'Medium', 'Semi Bold', 'Bold'];
  for (const style of styles) {
    try { await figma.loadFontAsync({ family: fontFamily, style }); }
    catch (e) { /* style not available, skip */ }
  }
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (e) {}
}

function post(type, payload) {
  figma.ui.postMessage(Object.assign({ type }, payload || {}));
}

async function generate(config) {
  post('progress', { text: 'Cargando fuentes…' });
  await loadFonts(config.typography.fontFamily);

  const page = figma.createPage();
  page.name = '🎨 ' + config.systemName;
  await figma.setCurrentPageAsync(page);

  // ---- 1. Primitive tokens ----
  post('progress', { text: 'Creando tokens primitivos…' });
  const primitives = figma.variables.createVariableCollection('Primitives');
  const primitiveModeId = primitives.modes[0].modeId;

  const colorVars = {}; // e.g. colorVars.blue[500] -> Variable
  const colorFamilies = {
    blue: config.brand.primary,
    gray: config.brand.neutral,
    red: config.brand.danger,
  };
  for (const family of Object.keys(colorFamilies)) {
    const ramp = generateRamp(colorFamilies[family]);
    colorVars[family] = {};
    RAMP_STEPS.forEach(step => {
      const v = figma.variables.createVariable(`color/${family}/${step}`, primitives, 'COLOR');
      v.setValueForMode(primitiveModeId, ramp[step]);
      colorVars[family][step] = v;
    });
  }

  const spacingVars = {};
  for (let i = 1; i <= config.spacing.steps; i++) {
    const v = figma.variables.createVariable(`spacing/${i}`, primitives, 'FLOAT');
    v.setValueForMode(primitiveModeId, config.spacing.base * i);
    spacingVars[i] = v;
  }

  const radiusVars = {};
  for (let i = 1; i <= config.radius.steps; i++) {
    const v = figma.variables.createVariable(`radius/${i}`, primitives, 'FLOAT');
    v.setValueForMode(primitiveModeId, config.radius.base * i);
    radiusVars[i] = v;
  }

  const fontSizeVars = {};
  for (let i = 0; i < config.typography.steps; i++) {
    const size = Math.round(config.typography.baseSize * Math.pow(config.typography.scaleRatio, i - 1));
    const v = figma.variables.createVariable(`fontSize/${i}`, primitives, 'FLOAT');
    v.setValueForMode(primitiveModeId, size);
    fontSizeVars[i] = v;
  }

  // ---- 2. Semantic tokens ----
  post('progress', { text: 'Creando tokens semánticos…' });
  const semantic = figma.variables.createVariableCollection('Semantic');
  const semanticModeId = semantic.modes[0].modeId;
  semantic.renameMode(semanticModeId, config.modes[0]);
  let darkModeId = null;
  if (config.modes.includes('Dark')) {
    darkModeId = semantic.addMode('Dark');
  }

  function alias(variable) {
    return { type: 'VARIABLE_ALIAS', id: variable.id };
  }

  function makeSemanticColor(name, lightFamily, lightStep, darkFamily, darkStep) {
    const v = figma.variables.createVariable(`color/${name}`, semantic, 'COLOR');
    v.setValueForMode(semanticModeId, alias(colorVars[lightFamily][lightStep]));
    if (darkModeId) {
      v.setValueForMode(darkModeId, alias(colorVars[darkFamily || lightFamily][darkStep != null ? darkStep : lightStep]));
    }
    return v;
  }

  const sem = {
    bgDefault: makeSemanticColor('bg/default', 'gray', 50, 'gray', 900),
    bgSubtle: makeSemanticColor('bg/subtle', 'gray', 100, 'gray', 800),
    bgPrimary: makeSemanticColor('bg/primary', 'blue', 500, 'blue', 400),
    bgPrimaryHover: makeSemanticColor('bg/primary-hover', 'blue', 600, 'blue', 300),
    bgSecondary: makeSemanticColor('bg/secondary', 'gray', 100, 'gray', 700),
    bgSecondaryHover: makeSemanticColor('bg/secondary-hover', 'gray', 200, 'gray', 600),
    bgDanger: makeSemanticColor('bg/danger', 'red', 500, 'red', 400),
    bgDangerHover: makeSemanticColor('bg/danger-hover', 'red', 600, 'red', 300),
    bgDisabled: makeSemanticColor('bg/disabled', 'gray', 100, 'gray', 800),
    borderDefault: makeSemanticColor('border/default', 'gray', 300, 'gray', 600),
    borderFocus: makeSemanticColor('border/focus', 'blue', 500, 'blue', 400),
    borderError: makeSemanticColor('border/error', 'red', 500, 'red', 400),
    textDefault: makeSemanticColor('text/default', 'gray', 900, 'gray', 50),
    textSubtle: makeSemanticColor('text/subtle', 'gray', 600, 'gray', 300),
    textOnPrimary: makeSemanticColor('text/on-primary', 'gray', 50, 'gray', 50),
    textDisabled: makeSemanticColor('text/disabled', 'gray', 400, 'gray', 600),
    textDanger: makeSemanticColor('text/danger', 'red', 600, 'red', 400),
    textSuccess: makeSemanticColor('text/success', 'blue', 700, 'blue', 300),
  };

  // ---- 3. Paint / binding helpers ----

  function solidPaint(rgb) {
    return { type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b } };
  }

  function boundFill(node, field, variable) {
    let paint = solidPaint({ r: 0, g: 0, b: 0 });
    paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable);
    node[field] = [paint];
  }

  function bindNumber(node, field, variable) {
    try { node.setBoundVariable(field, variable); } catch (e) { /* not bindable on this node type */ }
  }

  function stateColors(type, state) {
    // returns { bg, text, border } semantic variables for a given component "type" + interaction "state"
    const map = {
      primary:   { bg: sem.bgPrimary, bgHover: sem.bgPrimaryHover, text: sem.textOnPrimary, border: sem.bgPrimary },
      secondary: { bg: sem.bgSecondary, bgHover: sem.bgSecondaryHover, text: sem.textDefault, border: sem.borderDefault },
      outline:   { bg: sem.bgDefault, bgHover: sem.bgSubtle, text: sem.textDefault, border: sem.borderDefault },
      ghost:     { bg: sem.bgDefault, bgHover: sem.bgSubtle, text: sem.textDefault, border: sem.bgDefault },
      danger:    { bg: sem.bgDanger, bgHover: sem.bgDangerHover, text: sem.textOnPrimary, border: sem.bgDanger },
      neutral:   { bg: sem.bgSecondary, bgHover: sem.bgSecondaryHover, text: sem.textDefault, border: sem.borderDefault },
      success:   { bg: sem.bgPrimary, bgHover: sem.bgPrimaryHover, text: sem.textOnPrimary, border: sem.bgPrimary },
      warning:   { bg: sem.bgSecondary, bgHover: sem.bgSecondaryHover, text: sem.textDefault, border: sem.borderDefault },
      info:      { bg: sem.bgSecondary, bgHover: sem.bgSecondaryHover, text: sem.textDefault, border: sem.borderDefault },
      default:   { bg: sem.bgDefault, bgHover: sem.bgSubtle, text: sem.textDefault, border: sem.borderDefault },
    };
    const base = map[type] || map.default;
    let bg = base.bg, text = base.text, border = base.border;
    if (state === 'hover') bg = base.bgHover;
    if (state === 'disabled') { bg = sem.bgDisabled; text = sem.textDisabled; border = sem.bgDisabled; }
    if (state === 'focus' || state === 'error') border = state === 'error' ? sem.borderError : sem.borderFocus;
    return { bg, text, border };
  }

  const sizeScale = { sm: { pad: 2, font: 0, radius: 2 }, md: { pad: 3, font: 1, radius: 3 }, lg: { pad: 4, font: 2, radius: 4 } };

  function sizeTokens(size) {
    const s = sizeScale[size] || sizeScale.md;
    return {
      paddingV: spacingVars[Math.min(s.pad, config.spacing.steps)],
      paddingH: spacingVars[Math.min(s.pad + 2, config.spacing.steps)],
      gap: spacingVars[Math.min(2, config.spacing.steps)],
      font: fontSizeVars[Math.min(s.font, config.typography.steps - 1)],
      radius: radiusVars[Math.min(s.radius, config.radius.steps)],
    };
  }

  // ---- 4. Component builders ----

  function makeText(content, fontVar, colorVar, fontFamily) {
    const t = figma.createText();
    t.fontName = { family: fontFamily, style: 'Medium' };
    t.characters = content;
    bindNumber(t, 'fontSize', fontVar);
    boundFill(t, 'fills', colorVar);
    return t;
  }

  function autoFrame(name) {
    const f = figma.createFrame();
    f.name = name;
    f.layoutMode = 'HORIZONTAL';
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
    f.primaryAxisAlignItems = 'CENTER';
    f.counterAxisAlignItems = 'CENTER';
    f.fills = [];
    return f;
  }

  const BUILDERS = {
    button(size, type, state, tokens) {
      const t = sizeTokens(size);
      const colors = stateColors(type, state);
      const f = autoFrame(`Size=${size}, Type=${type}, State=${state}`);
      f.paddingLeft = f.paddingRight = 0;
      bindNumber(f, 'paddingLeft', t.paddingH);
      bindNumber(f, 'paddingRight', t.paddingH);
      bindNumber(f, 'paddingTop', t.paddingV);
      bindNumber(f, 'paddingBottom', t.paddingV);
      bindNumber(f, 'itemSpacing', t.gap);
      bindNumber(f, 'cornerRadius', t.radius);
      boundFill(f, 'fills', colors.bg);
      if (type === 'outline') {
        f.strokes = [solidPaint({ r: 0, g: 0, b: 0 })];
        const strokePaint = figma.variables.setBoundVariableForPaint(f.strokes[0], 'color', colors.border);
        f.strokes = [strokePaint];
        f.strokeWeight = 1;
      }
      const label = makeText('Label', t.font, colors.text, config.typography.fontFamily);
      f.appendChild(label);
      f.opacity = state === 'disabled' ? 0.6 : 1;
      return f;
    },
    input(size, type, state, tokens) {
      const t = sizeTokens(size);
      const colors = stateColors('outline', state);
      const f = autoFrame(`Size=${size}, State=${state}`);
      f.layoutMode = 'HORIZONTAL';
      f.primaryAxisAlignItems = 'MIN';
      f.counterAxisAlignItems = 'CENTER';
      f.minWidth = 160;
      bindNumber(f, 'paddingLeft', t.paddingH);
      bindNumber(f, 'paddingRight', t.paddingH);
      bindNumber(f, 'paddingTop', t.paddingV);
      bindNumber(f, 'paddingBottom', t.paddingV);
      bindNumber(f, 'cornerRadius', t.radius);
      boundFill(f, 'fills', sem.bgDefault);
      f.strokes = [solidPaint({ r: 0, g: 0, b: 0 })];
      const strokePaint = figma.variables.setBoundVariableForPaint(f.strokes[0], 'color', colors.border);
      f.strokes = [strokePaint];
      f.strokeWeight = state === 'focus' || state === 'error' ? 2 : 1;
      const label = makeText('Placeholder text', t.font, state === 'disabled' ? sem.textDisabled : sem.textSubtle, config.typography.fontFamily);
      f.appendChild(label);
      f.opacity = state === 'disabled' ? 0.6 : 1;
      return f;
    },
    checkbox(size, type, state, tokens) {
      const t = sizeTokens(size);
      const checked = state === 'checked';
      const f = autoFrame(`State=${state}`);
      const box = figma.createRectangle();
      box.resize(16, 16);
      bindNumber(box, 'cornerRadius', radiusVars[1]);
      boundFill(box, 'fills', checked ? sem.bgPrimary : sem.bgDefault);
      box.strokes = [solidPaint({ r: 0, g: 0, b: 0 })];
      const strokeVar = state === 'focus' ? sem.borderFocus : sem.borderDefault;
      box.strokes = [figma.variables.setBoundVariableForPaint(box.strokes[0], 'color', strokeVar)];
      box.strokeWeight = state === 'focus' ? 2 : 1;
      box.opacity = state === 'disabled' ? 0.6 : 1;
      f.appendChild(box);
      return f;
    },
    badge(size, type, state, tokens) {
      const t = sizeTokens(size);
      const colors = stateColors(type, 'default');
      const f = autoFrame(`Size=${size}, Type=${type}`);
      bindNumber(f, 'paddingLeft', t.paddingH);
      bindNumber(f, 'paddingRight', t.paddingH);
      bindNumber(f, 'paddingTop', spacingVars[1]);
      bindNumber(f, 'paddingBottom', spacingVars[1]);
      bindNumber(f, 'cornerRadius', radiusVars[config.radius.steps]);
      boundFill(f, 'fills', colors.bg);
      const label = makeText('Badge', t.font, colors.text, config.typography.fontFamily);
      f.appendChild(label);
      return f;
    },
    tag(size, type, state, tokens) {
      const f = BUILDERS.badge(size, type, state, tokens);
      f.name = `Size=${size}, Type=${type}, State=${state}`;
      if (state === 'hover') f.opacity = 0.85;
      return f;
    },
    card(size, type, state, tokens) {
      const t = sizeTokens('lg');
      const f = figma.createFrame();
      f.name = `Type=${type}, State=${state}`;
      f.layoutMode = 'VERTICAL';
      f.primaryAxisSizingMode = 'AUTO';
      f.counterAxisSizingMode = 'FIXED';
      f.resize(280, f.height);
      bindNumber(f, 'paddingLeft', t.paddingH);
      bindNumber(f, 'paddingRight', t.paddingH);
      bindNumber(f, 'paddingTop', t.paddingH);
      bindNumber(f, 'paddingBottom', t.paddingH);
      bindNumber(f, 'itemSpacing', spacingVars[2]);
      bindNumber(f, 'cornerRadius', radiusVars[Math.min(3, config.radius.steps)]);
      boundFill(f, 'fills', sem.bgDefault);
      if (type === 'outlined') {
        f.strokes = [solidPaint({ r: 0, g: 0, b: 0 })];
        f.strokes = [figma.variables.setBoundVariableForPaint(f.strokes[0], 'color', sem.borderDefault)];
        f.strokeWeight = 1;
      } else {
        f.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.08 }, offset: { x: 0, y: 2 }, radius: 8, visible: true, blendMode: 'NORMAL' }];
      }
      const title = makeText('Card title', fontSizeVars[Math.min(2, config.typography.steps - 1)], sem.textDefault, config.typography.fontFamily);
      const body = makeText('Supporting text for this card.', fontSizeVars[0], sem.textSubtle, config.typography.fontFamily);
      f.appendChild(title);
      f.appendChild(body);
      return f;
    },
    alert(size, type, state, tokens) {
      const t = sizeTokens('md');
      const colors = stateColors(type === 'warning' || type === 'info' ? 'neutral' : type === 'danger' ? 'danger' : 'primary', 'default');
      const f = autoFrame(`Type=${type}`);
      f.layoutMode = 'HORIZONTAL';
      f.primaryAxisAlignItems = 'MIN';
      f.resize(320, f.height);
      f.counterAxisSizingMode = 'AUTO';
      bindNumber(f, 'paddingLeft', t.paddingH);
      bindNumber(f, 'paddingRight', t.paddingH);
      bindNumber(f, 'paddingTop', t.paddingV);
      bindNumber(f, 'paddingBottom', t.paddingV);
      bindNumber(f, 'cornerRadius', t.radius);
      boundFill(f, 'fills', type === 'danger' ? sem.bgDanger : sem.bgSecondary);
      const textColor = type === 'danger' ? sem.textOnPrimary : sem.textDefault;
      const label = makeText(`${type.charAt(0).toUpperCase() + type.slice(1)} message goes here.`, t.font, textColor, config.typography.fontFamily);
      f.appendChild(label);
      return f;
    },
    avatar(size, type, state, tokens) {
      const dims = { sm: 24, md: 32, lg: 48 };
      const d = dims[size] || 32;
      const f = figma.createEllipse();
      f.name = `Size=${size}`;
      f.resize(d, d);
      boundFill(f, 'fills', sem.bgPrimary);
      return f;
    },
  };

  // ---- 5. Build component sets ----
  const componentSetNodes = [];
  let cursorY = 0;

  for (const comp of config.components) {
    post('progress', { text: `Generando componente: ${comp.label}…` });
    const builder = BUILDERS[comp.type];
    if (!builder) continue;
    const sizes = comp.sizes.length ? comp.sizes : ['md'];
    const types = comp.types.length ? comp.types : ['default'];
    const states = comp.states.length ? comp.states : ['default'];

    const variants = [];
    let cursorX = 0;
    for (const size of sizes) {
      for (const type of types) {
        for (const state of states) {
          const rawNode = builder(size, type, state, {});
          rawNode.x = cursorX;
          rawNode.y = 0;
          figma.currentPage.appendChild(rawNode);
          // combineAsVariants requires actual COMPONENT nodes, not plain frames/shapes.
          const node = figma.createComponentFromNode(rawNode);
          variants.push(node);
          cursorX += node.width + 40;
        }
      }
    }
    if (variants.length === 0) continue;
    const set = figma.combineAsVariants(variants, figma.currentPage);
    set.name = comp.label;
    set.x = 0;
    set.y = cursorY;
    set.layoutMode = 'WRAP';
    set.itemSpacing = 24;
    set.counterAxisSpacing = 24;
    set.paddingLeft = set.paddingRight = set.paddingTop = set.paddingBottom = 24;
    set.primaryAxisSizingMode = 'FIXED';
    set.resize(1400, set.height);
    componentSetNodes.push({ set, comp });
    cursorY += set.height + 80;
  }

  // ---- 6. Documentation page ----
  if (config.generateDocs) {
    post('progress', { text: 'Generando documentación…' });
    const docsPage = figma.createPage();
    docsPage.name = '📚 Documentación';
    await figma.setCurrentPageAsync(docsPage);

    let y = 0;
    const titleFont = fontSizeVars[Math.min(config.typography.steps - 1, config.typography.steps - 1)];

    // Cover
    const cover = makeText(config.systemName, fontSizeVars[config.typography.steps - 1], sem.textDefault, config.typography.fontFamily);
    cover.x = 0; cover.y = y;
    docsPage.appendChild(cover);
    y += 80;

    const subtitle = makeText(
      `Generado automáticamente · ${config.components.length} componentes · ${RAMP_STEPS.length} pasos de color · ${config.spacing.steps} pasos de spacing`,
      fontSizeVars[0], sem.textSubtle, config.typography.fontFamily
    );
    subtitle.x = 0; subtitle.y = y;
    docsPage.appendChild(subtitle);
    y += 60;

    // Color tokens swatch sheet
    const colorHeading = makeText('Tokens de color', fontSizeVars[Math.min(2, config.typography.steps - 1)], sem.textDefault, config.typography.fontFamily);
    colorHeading.x = 0; colorHeading.y = y;
    docsPage.appendChild(colorHeading);
    y += 40;

    let famY = y;
    for (const family of Object.keys(colorVars)) {
      let x = 0;
      const famLabel = makeText(family, fontSizeVars[0], sem.textSubtle, config.typography.fontFamily);
      famLabel.x = x; famLabel.y = famY;
      docsPage.appendChild(famLabel);
      x += 90;
      for (const step of RAMP_STEPS) {
        const swatch = figma.createRectangle();
        swatch.resize(56, 56);
        bindNumber(swatch, 'cornerRadius', radiusVars[2] || radiusVars[1]);
        boundFill(swatch, 'fills', colorVars[family][step]);
        swatch.x = x; swatch.y = famY;
        docsPage.appendChild(swatch);
        const stepLabel = makeText(String(step), fontSizeVars[0], sem.textSubtle, config.typography.fontFamily);
        stepLabel.x = x; stepLabel.y = famY + 60;
        docsPage.appendChild(stepLabel);
        x += 72;
      }
      famY += 100;
    }
    y = famY + 20;

    // Component index with specs
    const compHeading = makeText('Componentes', fontSizeVars[Math.min(2, config.typography.steps - 1)], sem.textDefault, config.typography.fontFamily);
    compHeading.x = 0; compHeading.y = y;
    docsPage.appendChild(compHeading);
    y += 40;

    for (const { comp } of componentSetNodes) {
      const spec = makeText(
        `${comp.label} — sizes: ${comp.sizes.join(', ')} · types: ${comp.types.join(', ')} · states: ${comp.states.join(', ')}`,
        fontSizeVars[0], sem.textSubtle, config.typography.fontFamily
      );
      spec.x = 0; spec.y = y;
      docsPage.appendChild(spec);
      y += 28;
    }

    figma.currentPage.name = docsPage.name;
  }

  post('progress', { text: 'Finalizando…' });
  figma.currentPage = page;
  figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
  post('done', { pageName: page.name });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate') {
    try {
      await generate(msg.config);
    } catch (err) {
      console.error(err);
      post('error', { text: (err && err.message) || 'Ocurrió un error generando el sistema.' });
    }
  }
};
