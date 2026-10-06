import test from "node:test";
import assert from "node:assert/strict";
import {
  attachPopover,
  dismissPopover,
  focusPopoverTrigger,
  isPopoverOpen,
  refreshPopover,
} from "../web/popover.mjs";

// This deliberately small DOM double checks interaction state and cleanup, not
// browser layout or native keyboard synthesis. The rendered browser checks
// cover those separately; these tests stay dependency-free and offline.
class TrackedTarget extends EventTarget {
  listeners = new Map();
  addEventListener(type, handler, options) {
    super.addEventListener(type, handler, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler, options) {
    super.removeEventListener(type, handler, options);
    this.listeners.get(type)?.delete(handler);
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((sum, items) => sum + items.size, 0);
  }
}

function emit(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { value });
  }
  target.dispatchEvent(event);
  return event;
}

function environment(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const observers = new Set();
  const cleanups = [];
  const doc = new TrackedTarget();
  class Element extends TrackedTarget {
    constructor(tagName) {
      super();
      this.tagName = tagName.toUpperCase();
      this.children = [];
      this.attributes = new Map();
      this.style = {};
      this.dataset = {};
      this.tabIndex = ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(this.tagName)
        ? 0 : -1;
      this.rect = { left: 80, right: 180, top: 80, bottom: 120, width: 100, height: 40 };
      this.scrollLeft = 0;
      this.scrollTop = 0;
    }
    get isConnected() {
      return this === doc.documentElement || Boolean(this.parentElement?.isConnected);
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
      if (name === "href" && this.tagName === "A") this.tabIndex = 0;
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...children) {
      for (const child of children) {
        child.remove();
        child.parentElement = this;
        this.children.push(child);
      }
    }
    remove() {
      if (!this.parentElement) return;
      if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
    contains(element) {
      return element === this || this.children.some((child) => child.contains(element));
    }
    closest(selector) {
      assert.equal(selector, "[data-preserve-popover]");
      return this.attributes.has("data-preserve-popover")
        ? this : this.parentElement?.closest(selector) || null;
    }
    querySelectorAll() {
      return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
    }
    getBoundingClientRect() { return this.rect; }
    getClientRects() { return this.isConnected && !this.hidden ? [this.rect] : []; }
    focus() {
      if (!this.isConnected || doc.activeElement === this) return;
      const previous = doc.activeElement;
      doc.activeElement = doc.body;
      emit(doc, "focusout", { target: previous, relatedTarget: this });
      doc.activeElement = this;
      emit(this, "focus", { relatedTarget: previous });
      emit(doc, "focusin", { target: this, relatedTarget: previous });
    }
    blur() {
      if (doc.activeElement !== this) return;
      doc.activeElement = doc.body;
      emit(doc, "focusout", { target: this, relatedTarget: null });
    }
  }
  doc.documentElement = new Element("html");
  doc.documentElement.clientWidth = 1024;
  doc.documentElement.clientHeight = 768;
  doc.documentElement.rect = { left: 0, right: 1024, top: 0, bottom: 768, width: 1024, height: 768 };
  doc.body = new Element("body");
  doc.body.rect = doc.documentElement.rect;
  doc.documentElement.append(doc.body);
  doc.activeElement = doc.body;
  doc.createElement = (tag) => new Element(tag);
  doc.querySelectorAll = () => doc.documentElement.querySelectorAll();
  const win = new TrackedTarget();
  win.scrollX = 0;
  win.scrollY = 0;
  win.visualViewport = new TrackedTarget();
  Object.assign(win.visualViewport, { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 });
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  const globals = {
    document: doc,
    window: win,
    Node: Element,
    MutationObserver: Observer,
    getComputedStyle: (element) => ({ overflowX: "visible", overflowY: "visible", ...element.style }),
  };
  const original = new Map();
  for (const [key, value] of Object.entries(globals)) {
    original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    dismissPopover();
    cleanups.forEach((cleanup) => cleanup());
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const button = () => {
    const result = doc.createElement("button");
    doc.body.append(result);
    return result;
  };
  const attach = (options = { preview: true }, trigger = button()) => {
    const cleanup = attachPopover(trigger, () => doc.createElement("p"), options);
    cleanups.push(cleanup);
    return { trigger, cleanup };
  };
  const panel = () => doc.body.children.find((child) => child.className === "popover");
  const assertClean = () => {
    assert.equal(isPopoverOpen(), false);
    assert.equal(panel(), undefined);
    assert.equal(observers.size, 0);
    assert.equal(doc.listenerCount, 0);
    assert.equal(win.listenerCount, 0);
    assert.equal(win.visualViewport.listenerCount, 0);
  };
  return { doc, win, observers, button, attach, panel, assertClean, tick: (ms) => t.mock.timers.tick(ms) };
}

test("default source controls ignore hover, focus and touch contact", () => {
  const trigger = new EventTarget();
  const attributes = new Map();
  trigger.setAttribute = (key, value) => attributes.set(key, value);
  trigger.getAttribute = (key) => attributes.get(key);
  trigger.removeAttribute = (key) => attributes.delete(key);
  trigger.isConnected = true;
  const cleanup = attachPopover(trigger, () => {
    assert.fail("Passive interaction must not request click-only details");
  });
  for (const type of ["pointerenter", "mouseenter", "mouseover", "focus", "focusin", "touchstart", "pointerdown"]) {
    emit(trigger, type);
    assert.equal(isPopoverOpen(), false);
    assert.equal(attributes.get("aria-expanded"), "false");
  }
  cleanup();
  assert.equal(attributes.has("aria-expanded"), false);
});

test("pointer preview survives transit to its panel and dismisses after leaving both", (t) => {
  const env = environment(t);
  const { trigger } = env.attach({ preview: true, id: "defender-details", label: "Defender details" });
  emit(trigger, "pointerenter", { pointerType: "mouse" });
  const panel = env.panel();
  const close = panel.children[0];
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(trigger.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.getAttribute("role"), "dialog");
  assert.equal(panel.getAttribute("aria-label"), "Defender details");
  assert.equal(close.textContent, "Close");
  emit(trigger, "pointerleave", { pointerType: "mouse" });
  env.tick(100);
  assert.equal(isPopoverOpen(), true);
  emit(panel, "pointerenter", { pointerType: "mouse" });
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(panel, "pointerleave", { pointerType: "mouse" });
  env.tick(180);
  env.assertClean();
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(panel.listenerCount, 0);
  assert.equal(close.listenerCount, 0);
});

test("reentering the marker cancels a pending leave dismissal", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  emit(trigger, "pointerenter");
  emit(trigger, "pointerleave");
  env.tick(100);
  emit(trigger, "pointerenter");
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "pointerleave");
  env.tick(180);
  env.assertClean();
});

test("focus preview supports Tab into the panel and Shift+Tab back", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  trigger.focus();
  const panel = env.panel();
  const close = panel.children[0];
  assert.equal(isPopoverOpen(), true);
  const tab = emit(env.doc, "keydown", { key: "Tab" });
  assert.equal(tab.defaultPrevented, true);
  assert.equal(env.doc.activeElement, close);
  emit(env.doc, "keydown", { key: "Tab", shiftKey: true });
  assert.equal(env.doc.activeElement, trigger);
  assert.equal(env.panel(), panel);
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
});

test("first click pins a focus preview and the next click closes without reopening", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  trigger.focus();
  const panel = env.panel();
  emit(trigger, "click", { detail: 0 });
  assert.equal(env.panel(), panel);
  emit(trigger, "pointerleave");
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "click", { detail: 0 });
  env.assertClean();
  assert.equal(env.doc.activeElement, trigger);
  trigger.focus();
  env.assertClean();
  trigger.blur();
  trigger.focus();
  assert.equal(isPopoverOpen(), true);
});

test("click pins a hover preview without requiring trigger focus", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  emit(trigger, "pointerenter");
  emit(trigger, "click");
  emit(trigger, "pointerleave");
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "click");
  env.assertClean();
});

test("touch contact is passive and consecutive taps reliably open and close", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  emit(trigger, "pointerenter", { pointerType: "touch" });
  emit(trigger, "pointerdown", { pointerType: "touch" });
  assert.equal(isPopoverOpen(), false);
  trigger.focus();
  emit(trigger, "click");
  emit(trigger, "pointerleave", { pointerType: "touch" });
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "click");
  env.assertClean();
  emit(trigger, "click");
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "click");
  env.assertClean();
});

test("Escape and Close restore focus without reopening a preview", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  trigger.focus();
  env.panel().children[0].focus();
  const escape = emit(env.doc, "keydown", { key: "Escape" });
  assert.equal(escape.defaultPrevented, true);
  env.assertClean();
  assert.equal(env.doc.activeElement, trigger);
  emit(trigger, "click");
  const close = env.panel().children[0];
  close.focus();
  emit(close, "click");
  env.assertClean();
  assert.equal(env.doc.activeElement, trigger);
  env.tick(500);
  env.assertClean();
});

test("Escape on a hover preview does not steal existing focus", (t) => {
  const env = environment(t);
  const outside = env.button();
  const { trigger } = env.attach();
  outside.focus();
  emit(trigger, "pointerenter");
  emit(env.doc, "keydown", { key: "Escape" });
  env.assertClean();
  assert.equal(env.doc.activeElement, outside);
});

test("restoring a rerendered marker's focus does not reopen dismissed details", (t) => {
  const env = environment(t);
  const { trigger: previous, cleanup } = env.attach();
  previous.focus();
  env.panel().children[0].focus();
  emit(env.doc, "keydown", { key: "Escape" });
  env.assertClean();
  cleanup();
  previous.remove();
  const { trigger } = env.attach();
  focusPopoverTrigger(trigger);
  assert.equal(env.doc.activeElement, trigger);
  env.assertClean();
  env.tick(500);
  env.assertClean();
  // Suppression is limited to restoration. The next deliberate interaction
  // still opens a preview, including actual focus after leaving the marker.
  trigger.blur();
  trigger.focus();
  assert.equal(isPopoverOpen(), true);
});

test("a new marker replaces an unpinned preview without stale timer or observer effects", (t) => {
  const env = environment(t);
  const first = env.attach().trigger;
  const second = env.attach().trigger;
  emit(first, "pointerenter");
  const previousPanel = env.panel();
  const previousObserver = [...env.observers][0];
  emit(first, "pointerleave");
  emit(second, "pointerenter");
  assert.equal(env.doc.body.children.filter((child) => child.className === "popover").length, 1);
  assert.equal(first.getAttribute("aria-expanded"), "false");
  assert.equal(second.getAttribute("aria-expanded"), "true");
  assert.equal(previousPanel.isConnected, false);
  first.remove();
  previousObserver.callback();
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  assert.equal(env.observers.size, 1);
});

test("hover cannot displace a pinned popup but deliberate focus can", (t) => {
  const env = environment(t);
  const first = env.attach().trigger;
  const second = env.attach().trigger;
  emit(first, "click");
  const panel = env.panel();
  emit(second, "pointerenter");
  assert.equal(env.panel(), panel);
  second.focus();
  assert.notEqual(env.panel(), panel);
  assert.equal(first.getAttribute("aria-expanded"), "false");
  assert.equal(second.getAttribute("aria-expanded"), "true");
});

test("outside press dismisses but trigger, panel and refresh interactions stay open", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  const refresh = env.button();
  refresh.setAttribute("data-preserve-popover", "");
  emit(trigger, "click");
  for (const target of [trigger, env.panel(), env.panel().children[0], refresh]) {
    emit(env.doc, "pointerdown", { target });
    assert.equal(isPopoverOpen(), true);
  }
  refresh.focus();
  assert.equal(isPopoverOpen(), true);
  emit(env.doc, "pointerdown", { target: env.doc.body });
  env.assertClean();
});

test("focus leaving the trigger/panel dismisses, including a null relatedTarget", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  const outside = env.button();
  trigger.focus();
  env.panel().children[0].focus();
  outside.focus();
  env.assertClean();
  trigger.focus();
  trigger.blur();
  env.tick(0);
  env.assertClean();
});

test("Tab after the panel returns to the next page control and dismisses", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  const next = env.button();
  trigger.focus();
  env.panel().children[0].focus();
  emit(env.doc, "keydown", { key: "Tab" });
  env.assertClean();
  assert.equal(env.doc.activeElement, next);
});

test("Tab after the final page control closes and permits native browser navigation", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  trigger.focus();
  env.panel().children[0].focus();
  const tab = emit(env.doc, "keydown", { key: "Tab" });
  assert.equal(tab.defaultPrevented, false);
  env.assertClean();
  assert.equal(env.doc.activeElement, trigger);
});

test("window blur, hidden document, external scroll and resize all dismiss", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  const events = [
    () => emit(env.win, "blur"),
    () => { env.doc.hidden = true; emit(env.doc, "visibilitychange"); },
    () => { env.doc.body.scrollTop += 10; emit(env.win, "scroll", { target: env.doc.body }); },
    () => emit(env.win, "resize"),
    () => { env.win.visualViewport.offsetTop += 10; emit(env.win.visualViewport, "scroll"); },
    () => emit(env.win.visualViewport, "resize"),
  ];
  for (const action of events) {
    env.doc.hidden = false;
    emit(trigger, "click");
    assert.equal(isPopoverOpen(), true);
    action();
    env.assertClean();
    env.tick(500);
    env.assertClean();
  }
});

test("queued ancestor scroll from before activation keeps details, later scrolling dismisses", (t) => {
  const env = environment(t);
  const list = env.doc.createElement("div");
  env.doc.body.append(list);
  const trigger = env.button();
  list.append(trigger);
  env.attach({ preview: false }, trigger);
  for (const axis of ["scrollTop", "scrollLeft"]) {
    list[axis] = 245;
    emit(trigger, "click");
    const panel = env.panel();
    emit(env.win, "scroll", { target: list });
    assert.equal(env.panel(), panel);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    env.tick(500);
    assert.equal(env.panel(), panel);
    list[axis] += 1;
    emit(env.win, "scroll", { target: list });
    env.assertClean();
  }
});

test("queued document and window scroll use the actual opening page offsets", (t) => {
  const env = environment(t);
  const { trigger } = env.attach({ preview: false });
  for (const target of [env.doc, env.win]) {
    env.win.scrollX = 30;
    env.win.scrollY = 245;
    emit(trigger, "click");
    const panel = env.panel();
    emit(env.win, "scroll", { target });
    assert.equal(env.panel(), panel);
    env.win.scrollY += 1;
    emit(env.win, "scroll", { target });
    env.assertClean();
  }
});

test("queued visual viewport scroll is ignored only while all opening offsets match", (t) => {
  const env = environment(t);
  const { trigger } = env.attach({ preview: false });
  const view = env.win.visualViewport;
  for (const axis of ["offsetLeft", "offsetTop", "pageLeft", "pageTop"]) {
    view[axis] = 25;
    emit(trigger, "click");
    const panel = env.panel();
    emit(view, "scroll");
    assert.equal(env.panel(), panel);
    view[axis] += 1;
    emit(view, "scroll");
    env.assertClean();
  }
});

test("scrolling an unrelated container still dismisses without an opening baseline", (t) => {
  const env = environment(t);
  const { trigger } = env.attach({ preview: false });
  const unrelated = env.doc.createElement("div");
  env.doc.body.append(unrelated);
  emit(trigger, "click");
  emit(env.win, "scroll", { target: unrelated });
  env.assertClean();
});

test("internal panel scrolling retains its popup and scroll position", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  emit(trigger, "click");
  const panel = env.panel();
  panel.scrollTop = 125;
  emit(env.win, "scroll", { target: panel });
  assert.equal(env.panel(), panel);
  assert.equal(panel.scrollTop, 125);
  refreshPopover();
  assert.equal(env.panel(), panel);
  assert.equal(panel.scrollTop, 125);
});

test("shrinking the viewport dismisses and a subsequent open uses the smaller bounds", (t) => {
  const env = environment(t);
  const { trigger } = env.attach();
  emit(trigger, "pointerenter");
  emit(trigger, "pointerleave");
  env.win.visualViewport.width = 320;
  env.win.visualViewport.height = 240;
  env.doc.documentElement.clientWidth = 320;
  env.doc.documentElement.clientHeight = 240;
  emit(env.win, "resize");
  env.assertClean();
  env.tick(500);
  env.assertClean();
  emit(trigger, "click");
  assert.ok(parseFloat(env.panel().style.maxWidth) <= 296);
  assert.ok(parseFloat(env.panel().style.maxHeight) <= 216);
});

test("removing either trigger or panel cleans active DOM, observers and listeners", (t) => {
  const env = environment(t);
  for (const removed of ["trigger", "panel"]) {
    const { trigger } = env.attach();
    emit(trigger, "pointerenter");
    emit(trigger, "pointerleave");
    (removed === "trigger" ? trigger : env.panel()).remove();
    [...env.observers][0].callback();
    env.assertClean();
    env.tick(500);
    env.assertClean();
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  }
});

test("reattaching is single-owner and old cleanup cannot break the new attachment", (t) => {
  const env = environment(t);
  const { trigger, cleanup: oldCleanup } = env.attach();
  emit(trigger, "pointerenter");
  emit(trigger, "pointerleave");
  const { cleanup } = env.attach({ id: "new-details", preview: true }, trigger);
  env.assertClean();
  oldCleanup();
  assert.equal(trigger.getAttribute("aria-controls"), "new-details");
  assert.equal(trigger.listenerCount, 4);
  trigger.focus();
  env.tick(500);
  assert.equal(env.panel().id, "new-details");
  cleanup();
  cleanup();
  env.assertClean();
  assert.equal(trigger.listenerCount, 0);
  assert.equal(trigger.getAttribute("aria-haspopup"), null);
  assert.equal(trigger.getAttribute("aria-controls"), null);
  assert.equal(trigger.getAttribute("aria-expanded"), null);
  emit(trigger, "pointerenter");
  emit(trigger, "focus");
  emit(trigger, "click");
  env.tick(500);
  env.assertClean();
});

test("default click-only controls still toggle and get explicit dismissal", (t) => {
  const env = environment(t);
  const { trigger } = env.attach({});
  trigger.focus();
  assert.equal(isPopoverOpen(), false);
  emit(trigger, "click");
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "pointerleave");
  env.tick(500);
  assert.equal(isPopoverOpen(), true);
  emit(trigger, "click");
  env.assertClean();
  emit(trigger, "click");
  emit(env.panel().children[0], "click");
  env.assertClean();
});
