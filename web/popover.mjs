let active = null;
let nextId = 0;
const attachments = new WeakMap();
const restoredTriggers = new WeakSet();
const previewTriggers = new WeakSet();
const suppressedPreviews = new WeakSet();
const POINTER_GRACE_MS = 180;
const FOCUSABLE =
  'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

// Fixed viewport coordinates keep a report visible outside narrow, scrolling tiles.
export function popoverPosition(rect, size, viewport, gap = 10, margin = 12) {
  const leftEdge = (viewport.left || 0) + margin;
  const topEdge = (viewport.top || 0) + margin;
  const rightEdge = (viewport.left || 0) + viewport.width - margin;
  const bottomEdge = (viewport.top || 0) + viewport.height - margin;
  const maxWidth = Math.max(0, rightEdge - leftEdge);
  const width = Math.min(size.width, maxWidth);
  const below = Math.max(0, bottomEdge - rect.bottom - gap);
  const above = Math.max(0, rect.top - gap - topEdge);
  const placement = below >= size.height || below >= above ? "bottom" : "top";
  const maxHeight = Math.min(
    Math.max(0, bottomEdge - topEdge),
    placement === "bottom" ? below : above,
  );
  const height = Math.min(size.height, maxHeight);
  return {
    left: Math.min(Math.max(rect.left, leftEdge), rightEdge - width),
    top:
      placement === "bottom"
        ? Math.max(topEdge, rect.bottom + gap)
        : Math.max(topEdge, rect.top - gap - height),
    maxWidth,
    maxHeight,
    placement,
  };
}

function viewport() {
  const view = window.visualViewport;
  return {
    left: view?.offsetLeft || 0,
    top: view?.offsetTop || 0,
    width: view?.width || document.documentElement.clientWidth,
    height: view?.height || document.documentElement.clientHeight,
  };
}

export function isPopoverOpen() {
  return Boolean(active);
}

function visibleTriggerRect(trigger, view) {
  const rect = trigger.getBoundingClientRect();
  let left = Math.max(rect.left, view.left);
  let right = Math.min(rect.right, view.left + view.width);
  let top = Math.max(rect.top, view.top);
  let bottom = Math.min(rect.bottom, view.top + view.height);
  for (
    let parent = trigger.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
  }
  return right > left && bottom > top ? rect : null;
}

function scrollPosition(target) {
  if (target === window || target === document)
    return [window.scrollX || 0, window.scrollY || 0];
  if (target === window.visualViewport)
    return [
      target.offsetLeft || 0,
      target.offsetTop || 0,
      target.pageLeft || 0,
      target.pageTop || 0,
    ];
  return [target.scrollLeft || 0, target.scrollTop || 0];
}

function openingScrollPositions(trigger) {
  const targets = [window, document];
  if (window.visualViewport) targets.push(window.visualViewport);
  for (let parent = trigger.parentElement; parent; parent = parent.parentElement)
    targets.push(parent);
  return new Map(targets.map((target) => [target, scrollPosition(target)]));
}

export function refreshPopover(event) {
  if (!active) return;
  // Scrolling a long panel must not temporarily enlarge it and clamp scrollTop.
  if (
    event?.type === "scroll" &&
    event.target instanceof Node &&
    active.panel.contains(event.target)
  )
    return;
  if (event?.type === "scroll" &&
      active.trigger.isConnected && active.panel.isConnected) {
    // A click or keyboard focus can scroll its row before opening details, but
    // the browser may deliver that scroll event afterward. Ignore only a known
    // container whose position still matches opening; later movement and
    // unrelated external scrolling continue to dismiss immediately.
    const before = active.scrollPositions.get(event.target);
    const current = before && scrollPosition(event.target);
    if (before && before.every((value, index) => value === current[index])) return;
  }
  if (
    event?.type === "scroll" ||
    event?.type === "resize" ||
    !active.trigger.isConnected ||
    !active.panel.isConnected
  ) {
    dismissPopover();
    return;
  }
  const { panel, trigger } = active;
  const view = viewport();
  const rect = visibleTriggerRect(trigger, view);
  if (!rect) {
    dismissPopover();
    return;
  }
  const scrollTop = panel.scrollTop;
  panel.style.maxWidth = `${Math.max(0, view.width - 24)}px`;
  panel.style.maxHeight = `${Math.max(0, view.height - 24)}px`;
  // Keep the panel adjacent to its row while clamping it to the viewport.
  const position = popoverPosition(
    rect,
    panel.getBoundingClientRect(),
    view,
    0,
  );
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;
  panel.style.maxHeight = `${position.maxHeight}px`;
  panel.dataset.placement = position.placement;
  panel.scrollTop = scrollTop;
}

function focusableWithin(parent) {
  return [...parent.querySelectorAll(FOCUSABLE)].filter(
    (element) =>
      !element.disabled &&
      element.tabIndex >= 0 &&
      element.getClientRects().length,
  );
}

function nextControl(trigger, panel) {
  const controls = focusableWithin(document).filter(
    (element) => !panel.contains(element),
  );
  return controls[controls.indexOf(trigger) + 1];
}

function containsFocus(record) {
  return (
    record.trigger.contains(document.activeElement) ||
    record.panel?.contains(document.activeElement)
  );
}

function clearLeaveTimer(record) {
  clearTimeout(record.leaveTimer);
  record.leaveTimer = null;
}

function scheduleLeave(record) {
  clearLeaveTimer(record);
  if (active !== record || record.pinned) return;
  record.leaveTimer = setTimeout(() => {
    record.leaveTimer = null;
    if (
      active === record &&
      !record.overTrigger &&
      !record.overPanel &&
      !record.pinned &&
      !containsFocus(record)
    )
      dismissPopover();
  }, POINTER_GRACE_MS);
}

// Restoring focus after a popup closes or a board rerender is not a new
// request to preview details. User-driven focus still opens previews normally.
export function focusPopoverTrigger(trigger) {
  if (!trigger?.isConnected) return;
  const alreadyRestoring = restoredTriggers.has(trigger);
  restoredTriggers.add(trigger);
  try {
    trigger.focus({ preventScroll: true });
  } finally {
    if (!alreadyRestoring) restoredTriggers.delete(trigger);
  }
}

function closeAndRestore(record, restore = false) {
  const shouldRestore = restore || record.panel.contains(document.activeElement);
  const point = record.pointerPosition;
  dismissPopover();
  // Removing a panel can uncover a marker beneath a stationary mouse. That
  // synthetic pointerenter is not a request for another preview. Leave/reenter,
  // click or deliberate keyboard focus can still open the exposed marker.
  for (let exposed = point && document.elementFromPoint?.(point.x, point.y);
       exposed; exposed = exposed.parentElement) {
    if (previewTriggers.has(exposed)) {
      suppressedPreviews.add(exposed);
      break;
    }
  }
  if (shouldRestore) focusPopoverTrigger(record.trigger);
}
function rememberPointer(record, event) {
  if (event.pointerType === "touch") record.pointerPosition = null;
  else if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY))
    record.pointerPosition = {x: event.clientX, y: event.clientY};
}

function onOutsidePointer(event) {
  if (active) rememberPointer(active, event);
  if (event.target.closest?.("[data-preserve-popover]")) return;
  if (
    active &&
    !active.trigger.contains(event.target) &&
    !active.panel.contains(event.target)
  ) {
    dismissPopover();
  }
}

function onKeydown(event) {
  if (!active) return;
  const record = active;
  const { trigger, panel } = active;
  if (event.key === "Escape") {
    event.preventDefault();
    closeAndRestore(record);
    return;
  }
  if (event.key !== "Tab") return;
  const controls = focusableWithin(panel);
  if (document.activeElement === trigger && !event.shiftKey) {
    event.preventDefault();
    (controls[0] || panel).focus();
  } else if (panel.contains(document.activeElement)) {
    if (
      event.shiftKey &&
      (document.activeElement === controls[0] ||
        document.activeElement === panel)
    ) {
      event.preventDefault();
      trigger.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === controls.at(-1) || !controls.length)
    ) {
      const next = nextControl(trigger, panel);
      if (next) {
        event.preventDefault();
        dismissPopover();
        next.focus();
      } else {
        // Let native Tab continue from the trigger to browser chrome rather
        // than trapping focus in the body-appended popup.
        dismissPopover();
        focusPopoverTrigger(record.trigger);
      }
    }
  }
}

function onFocusChange(event) {
  if (!active) return;
  clearTimeout(active.focusTimer);
  active.focusTimer = null;
  if (event.target.closest?.("[data-preserve-popover]")) return;
  if (
    active &&
    !active.trigger.contains(event.target) &&
    !active.panel.contains(event.target)
  ) {
    dismissPopover();
  }
}

function onFocusOut(event) {
  if (!active) return;
  const record = active;
  if (
    record.trigger.contains(event.relatedTarget) ||
    record.panel.contains(event.relatedTarget) ||
    event.relatedTarget?.closest?.("[data-preserve-popover]")
  )
    return;
  clearTimeout(record.focusTimer);
  // A null relatedTarget also occurs when focus leaves the document. Wait
  // until the browser has updated activeElement before deciding to dismiss.
  record.focusTimer = setTimeout(() => {
    record.focusTimer = null;
    if (active === record && !containsFocus(record)) dismissPopover();
  }, 0);
}

function onVisibilityChange() {
  if (document.hidden) dismissPopover();
}

function listen(record, target, type, handler, options) {
  target.addEventListener(type, handler, options);
  record.removeListeners.push(() =>
    target.removeEventListener(type, handler, options),
  );
}

function openPopover(record, pinned = false) {
  if (active === record || !record.trigger.isConnected) return;
  dismissPopover();
  const panel = document.createElement("div");
  panel.id = record.id;
  panel.className = "popover";
  panel.tabIndex = -1;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", record.label);
  panel.style.position = "fixed";
  panel.style.overflow = "auto";
  panel.style.left = "0px";
  panel.style.top = "0px";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "popover-close";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close details");
  record.removeListeners = [];
  listen(record, close, "click", () => closeAndRestore(record, true));
  panel.append(
    close,
    typeof record.content === "function" ? record.content() : record.content,
  );
  record.panel = panel;
  record.pinned = pinned;
  record.overPanel = false;
  active = record;
  document.body.append(panel);
  record.trigger.setAttribute("aria-expanded", "true");
  record.scrollPositions = openingScrollPositions(record.trigger);
  record.observer = new MutationObserver(() => {
    if (
      active === record &&
      (!record.trigger.isConnected || !panel.isConnected)
    )
      dismissPopover();
  });
  record.observer.observe(document.body, { childList: true, subtree: true });
  if (record.preview) {
    listen(record, panel, "pointerenter", (event) => {
      if (event.pointerType === "touch") return;
      record.overPanel = true;
      clearLeaveTimer(record);
    });
    listen(record, panel, "pointerleave", (event) => {
      if (event.pointerType === "touch") return;
      record.overPanel = false;
      scheduleLeave(record);
    });
  }
  listen(record, window, "resize", refreshPopover);
  listen(record, panel, "toggle", refreshPopover, true);
  listen(record, window, "scroll", refreshPopover, true);
  listen(record, window, "blur", dismissPopover);
  if (window.visualViewport) {
    listen(record, window.visualViewport, "resize", refreshPopover);
    listen(record, window.visualViewport, "scroll", refreshPopover);
  }
  listen(record, document, "pointerdown", onOutsidePointer, true);
  listen(record, document, "pointermove", event => rememberPointer(record, event), true);
  listen(record, document, "keydown", onKeydown, true);
  listen(record, document, "focusin", onFocusChange);
  listen(record, document, "focusout", onFocusOut);
  listen(record, document, "visibilitychange", onVisibilityChange);
  refreshPopover();
}

export function dismissPopover() {
  if (!active) return;
  const record = active;
  active = null;
  clearLeaveTimer(record);
  clearTimeout(record.focusTimer);
  record.focusTimer = null;
  record.removeListeners.splice(0).forEach((remove) => remove());
  record.observer.disconnect();
  record.trigger.setAttribute("aria-expanded", "false");
  record.panel.remove();
  record.panel = null;
  record.scrollPositions = null;
  record.pinned = false;
  record.overPanel = false;
}

export function attachPopover(trigger, content, { id, label, preview = false } = {}) {
  attachments.get(trigger)?.();
  const record = {
    trigger,
    content,
    id: id || `popover-${++nextId}`,
    label: label || trigger.getAttribute("aria-label") || "Details",
    preview,
    overTrigger: false,
  };
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", record.id);
  trigger.setAttribute("aria-expanded", "false");
  // Native buttons emit click for pointer/touch, Enter and Space. A click
  // pins an existing preview; only the next click toggles that popup closed.
  // Default source-information controls remain deliberately click-only.
  const activate = (event) => {
    suppressedPreviews.delete(trigger);
    record.pointerPosition = null;
    if (event.detail) rememberPointer(record, event);
    if (active === record && record.pinned) closeAndRestore(record);
    else if (active === record) {
      record.pinned = true;
      clearLeaveTimer(record);
    } else openPopover(record, true);
  };
  const enter = (event) => {
    if (event.pointerType === "touch") return;
    record.overTrigger = true;
    rememberPointer(record, event);
    clearLeaveTimer(record);
    if (suppressedPreviews.has(trigger)) return;
    // A deliberate click stays pinned until another deliberate interaction.
    if (!active?.pinned) openPopover(record);
  };
  const leave = (event) => {
    if (event.pointerType === "touch") return;
    record.overTrigger = false;
    suppressedPreviews.delete(trigger);
    scheduleLeave(record);
  };
  const focus = () => {
    if (!restoredTriggers.has(trigger)) {
      suppressedPreviews.delete(trigger);
      record.pointerPosition = null;
      openPopover(record);
    }
  };
  trigger.addEventListener("click", activate);
  if (preview) {
    previewTriggers.add(trigger);
    trigger.addEventListener("pointerenter", enter);
    trigger.addEventListener("pointerleave", leave);
    trigger.addEventListener("focus", focus);
  }
  const cleanup = () => {
    if (record.cleaned) return;
    record.cleaned = true;
    if (active === record) dismissPopover();
    trigger.removeEventListener("click", activate);
    trigger.removeEventListener("pointerenter", enter);
    trigger.removeEventListener("pointerleave", leave);
    trigger.removeEventListener("focus", focus);
    trigger.removeAttribute("aria-haspopup");
    trigger.removeAttribute("aria-controls");
    trigger.removeAttribute("aria-expanded");
    previewTriggers.delete(trigger);
    suppressedPreviews.delete(trigger);
    attachments.delete(trigger);
  };
  attachments.set(trigger, cleanup);
  return cleanup;
}
