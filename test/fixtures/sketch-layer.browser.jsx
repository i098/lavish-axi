/* global document, Event, HTMLTextAreaElement, KeyboardEvent, location, window, WheelEvent */

// Mounts the real sketch layer as a top-level page and plays the chrome's side of the channel:
// the frame posts to `window.top`, which is this window. Select-all stands in for the reviewer
// selecting a sketch, so the run drives the same selection -> Comment -> Queue path a click does.
import "@excalidraw/excalidraw/index.css";
import "../../src/whiteboard-frame.css";

import { startSketchFrame } from "../../src/sketch-frame.js";

window.EXCALIDRAW_ASSET_PATH = `${location.origin}/whiteboard-assets/`;
window.__lavishWhiteboardChannelToken = "fixture-token";

const RECT = {
  id: "box",
  type: "rectangle",
  x: 120,
  y: 300,
  width: 200,
  height: 60,
  strokeColor: "#e03131",
  backgroundColor: "transparent",
};

const fromFrame = [];
window.addEventListener("message", (event) => {
  const type = String(event.data?.type || "");
  if (type === "lavish-sketch:ready" || type === "lavish-sketch:comment" || type === "lavish-sketch:scrollBy") {
    fromFrame.push(event.data);
  }
});

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function until(read, what) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = read();
    if (value) return value;
    await sleep(25);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function toChrome(message) {
  window.postMessage({ ...message, channelId: "fixture-token" }, "*");
}

async function run() {
  startSketchFrame();
  await until(() => fromFrame.find((m) => m.type === "lavish-sketch:ready"), "the ready message");
  // The artifact is scrolled 200px down when the layer boots.
  toChrome({
    type: "lavish-sketch:init",
    scene: { elements: [RECT], files: {} },
    active: true,
    scroll: { x: 0, y: 200 },
  });
  await until(() => document.querySelector(".excalidraw canvas"), "the editor");
  await sleep(300);

  // Excalidraw handles keys on its container unless handleKeyboardGlobally is set.
  document
    .querySelector(".excalidraw")
    .dispatchEvent(new KeyboardEvent("keydown", { key: "a", code: "KeyA", ctrlKey: true, bubbles: true }));
  const button = await until(() => document.querySelector(".sk-comment"), "the Comment button");
  // Scene y 300..360 at scroll 200 is viewport y 100..160; the button sits just below it.
  const buttonTop = Math.round(button.getBoundingClientRect().top);

  toChrome({ type: "lavish-sketch:scroll", x: 0, y: 250 });
  await sleep(150);
  const scrolledTop = Math.round(document.querySelector(".sk-comment").getBoundingClientRect().top);

  document
    .querySelector(".excalidraw")
    .dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  const scrollBy = await until(() => fromFrame.find((m) => m.type === "lavish-sketch:scrollBy"), "wheel relay");

  document.querySelector(".sk-comment").click();
  const textarea = await until(() => document.querySelector(".sk-card textarea"), "the comment card");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "Make this primary");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(50);
  document.querySelector(".sk-card .sk-queue").click();
  const comment = await until(() => fromFrame.find((m) => m.type === "lavish-sketch:comment"), "the comment");
  toChrome({ type: "lavish-sketch:commentResult", ok: true });
  await sleep(150);

  const pngSignature = Array.from(comment.png.slice(0, 4)).join(",");
  return {
    pass: true,
    canvasBackground: window.getComputedStyle(document.body).backgroundColor,
    buttonTop,
    scrolledTop,
    wheelDeltaY: scrollBy.y,
    comment: {
      text: comment.comment,
      ids: comment.ids,
      label: comment.label,
      bounds: comment.bounds,
      point: comment.point,
    },
    pngSignature,
    cardClosed: !document.querySelector(".sk-card"),
  };
}

function report(result) {
  location.replace(`/result?value=${encodeURIComponent(JSON.stringify(result))}`);
}

run().then(
  (result) => report(result),
  (error) => report({ pass: false, error: error?.stack || String(error) }),
);
