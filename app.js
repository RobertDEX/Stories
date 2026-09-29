import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// =============================================================
// FIREBASE CONFIG
// Paste the SAME config that already works on your current site.
// Firebase Console → Project settings → Your apps → Web app → Config
// =============================================================
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
}[c]));
const timestampToMs = (value) => value?.toMillis?.() || 0;

const dashboardView = $("#dashboardView");
const editorView = $("#editorView");
const storyGrid = $("#storyGrid");
const emptyStories = $("#emptyStories");
const storySearch = $("#storySearch");
const sortSelect = $("#sortSelect");
const syncPill = $("#syncPill");
const syncText = $("#syncText");
const storyTitle = $("#storyTitle");
const characterSelect = $("#characterSelect");
const noCharacters = $("#noCharacters");
const characterWorkspace = $("#characterWorkspace");
const portraitFrame = $("#portraitFrame");
const portraitImage = $("#portraitImage");
const portraitInput = $("#portraitInput");
const charName = $("#charName");
const charAge = $("#charAge");
const charHeight = $("#charHeight");
const customFields = $("#customFields");
const sectionList = $("#sectionList");
const sectionTitleInput = $("#sectionTitleInput");
const sectionContent = $("#sectionContent");
const saveState = $("#saveState");
const characterSerial = $("#characterSerial");

const modalBackdrop = $("#modalBackdrop");
const modalForm = $("#modalForm");
const modalTitle = $("#modalTitle");
const modalDescription = $("#modalDescription");
const modalEyebrow = $("#modalEyebrow");
const modalInputLabel = $("#modalInputLabel");
const modalInput = $("#modalInput");
const modalUploadWrap = $("#modalUploadWrap");
const modalFile = $("#modalFile");
const modalFileName = $("#modalFileName");
const modalSubmit = $("#modalSubmit");

let stories = [];
let currentStoryId = null;
let currentStory = null;
let characters = [];
let activeCharacterId = null;
let activeSectionId = null;
let lastRenderedSectionId = null;
let unsubscribeStories = null;
let unsubscribeStory = null;
let unsubscribeCharacters = null;
let modalResolver = null;
let saveTimer = null;
let pendingSave = null;
let savedSelection = null;

const currentCharacter = () => characters.find(c => c.id === activeCharacterId) || null;

function setSync(status, text) {
  syncPill.classList.remove("online", "error");
  if (status) syncPill.classList.add(status);
  syncText.textContent = String(text || "").toUpperCase();
}

function setSaveState(state, text) {
  saveState.classList.remove("saving", "saved", "error");
  if (state) saveState.classList.add(state);
  saveState.textContent = text;
}

function toast(message, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  $("#toastStack").append(el);
  setTimeout(() => el.remove(), 3400);
}

function showView(name) {
  dashboardView.classList.toggle("active", name === "dashboard");
  editorView.classList.toggle("active", name === "editor");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(options = {}) {
  modalEyebrow.textContent = options.eyebrow || "// CREATE";
  modalTitle.textContent = options.title || "NEW FILE";
  modalDescription.textContent = options.description || "";
  modalInputLabel.textContent = options.label || "NAME";
  modalInput.placeholder = options.placeholder || "";
  modalInput.value = options.value || "";
  modalSubmit.textContent = options.submit || "CREATE";
  modalUploadWrap.classList.toggle("hidden", !options.showUpload);
  modalFile.value = "";
  modalFileName.textContent = options.uploadText || "OPTIONAL";
  modalBackdrop.classList.remove("hidden");
  setTimeout(() => modalInput.focus(), 30);

  return new Promise(resolve => { modalResolver = resolve; });
}

function closeModal(result = null) {
  modalBackdrop.classList.add("hidden");
  modalForm.reset();
  modalFileName.textContent = "OPTIONAL";
  modalResolver?.(result);
  modalResolver = null;
}

modalForm.addEventListener("submit", event => {
  event.preventDefault();
  const value = modalInput.value.trim();
  if (!value) return;
  closeModal({ value, file: modalFile.files[0] || null });
});
$("#modalCancel").addEventListener("click", () => closeModal());
$("#modalClose").addEventListener("click", () => closeModal());
modalBackdrop.addEventListener("click", event => { if (event.target === modalBackdrop) closeModal(); });
modalFile.addEventListener("change", () => {
  modalFileName.textContent = modalFile.files[0]?.name || "OPTIONAL";
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modalBackdrop.classList.contains("hidden")) closeModal();
});

function renderStories() {
  const search = storySearch.value.trim().toLowerCase();
  const sort = sortSelect.value;
  let filtered = stories.filter(story => (story.title || "Untitled Story").toLowerCase().includes(search));

  filtered = [...filtered].sort((a, b) => {
    if (sort === "az") return (a.title || "").localeCompare(b.title || "");
    if (sort === "za") return (b.title || "").localeCompare(a.title || "");
    if (sort === "oldest") return timestampToMs(a.createdAt) - timestampToMs(b.createdAt);
    return timestampToMs(b.createdAt) - timestampToMs(a.createdAt);
  });

  storyGrid.innerHTML = filtered.map(story => {
    const cover = story.coverData || story.coverUrl || "";
    const coverStyle = cover ? `style="background-image:url('${escapeHtml(cover)}')"` : "";
    const created = story.createdAt?.toDate?.();
    const dateText = created
      ? created.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "NEW FILE";

    return `
      <button class="story-card ${cover ? "" : "no-cover"}" type="button" data-story-id="${story.id}">
        <div class="story-card-cover" ${coverStyle}></div>
        <div class="story-card-arrow">↗</div>
        <div class="story-card-content">
          <span class="story-card-kicker">// STORY FILE</span>
          <h3>${escapeHtml(story.title || "Untitled Story")}</h3>
          <div class="story-card-meta">ARCHIVED ${escapeHtml(dateText.toUpperCase())}</div>
        </div>
      </button>`;
  }).join("");

  emptyStories.classList.toggle("hidden", stories.length > 0 || search.length > 0);
  storyGrid.classList.toggle("hidden", filtered.length === 0);
}

storyGrid.addEventListener("click", event => {
  const card = event.target.closest(".story-card");
  if (card) openStory(card.dataset.storyId);
});

function subscribeToStories() {
  unsubscribeStories?.();
  unsubscribeStories = onSnapshot(collection(db, "stories"), snapshot => {
    stories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStories();
    setSync("online", "Synced");
  }, error => {
    console.error(error);
    setSync("error", "Sync error");
    toast("Firestore denied access. Publish the included firestore.rules file.", "error");
  });
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

async function fileToCompressedDataUrl(file, options = {}) {
  if (!file?.type?.startsWith("image/")) throw new Error("Please choose an image file.");

  const maxWidth = options.maxWidth || 1100;
  const maxHeight = options.maxHeight || 1100;
  const maxBytes = options.maxBytes || 360000;

  const inputUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The image could not be opened."));
      image.src = inputUrl;
    });

    let scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    let quality = 0.86;
    let dataUrl = "";

    for (let attempt = 0; attempt < 8; attempt++) {
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#11100d";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      dataUrl = canvas.toDataURL("image/jpeg", quality);

      if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
      quality = Math.max(0.54, quality - 0.07);
      scale *= 0.86;
    }

    if (dataUrlBytes(dataUrl) > maxBytes) throw new Error("Image is still too large after compression.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(inputUrl);
  }
}

async function createStory() {
  const result = await openModal({
    eyebrow: "// NEW STORY FILE",
    title: "CREATE STORY",
    description: "The story file name is independent from every character name inside it.",
    label: "STORY / FILE NAME",
    placeholder: "Jumping Through Mysteries",
    submit: "CREATE STORY",
    showUpload: true,
    uploadText: "OPTIONAL COVER IMAGE"
  });
  if (!result) return;

  try {
    setSync("", "Saving");
    let coverData = "";
    if (result.file) {
      coverData = await fileToCompressedDataUrl(result.file, { maxWidth: 1500, maxHeight: 900, maxBytes: 470000 });
    }

    const refDoc = await addDoc(collection(db, "stories"), {
      title: result.value,
      coverData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    toast("Story file created.");
    openStory(refDoc.id);
  } catch (error) {
    console.error(error);
    setSync("error", "Save failed");
    toast(error.message || "Could not create the story.", "error");
  }
}

function openStory(storyId) {
  flushPendingSave();
  currentStoryId = storyId;
  currentStory = null;
  characters = [];
  activeCharacterId = null;
  activeSectionId = null;
  lastRenderedSectionId = null;
  showView("editor");

  unsubscribeStory?.();
  unsubscribeCharacters?.();

  unsubscribeStory = onSnapshot(doc(db, "stories", storyId), snap => {
    if (!snap.exists()) return goHome();
    currentStory = { id: snap.id, ...snap.data() };
    storyTitle.textContent = currentStory.title || "Untitled Story";
  }, error => {
    console.error(error);
    toast("Could not load this story file.", "error");
  });

  unsubscribeCharacters = onSnapshot(collection(db, "stories", storyId, "characters"), snapshot => {
    const previousId = activeCharacterId;
    characters = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    if (!activeCharacterId || !characters.some(c => c.id === activeCharacterId)) {
      activeCharacterId = characters[0]?.id || null;
      activeSectionId = null;
      lastRenderedSectionId = null;
    }

    renderCharacterSwitcher();
    renderCharacter(previousId !== activeCharacterId);
    setSync("online", "Synced");
  }, error => {
    console.error(error);
    toast("Could not load characters.", "error");
  });
}

function goHome() {
  flushPendingSave();
  unsubscribeStory?.();
  unsubscribeCharacters?.();
  unsubscribeStory = null;
  unsubscribeCharacters = null;
  currentStoryId = null;
  currentStory = null;
  characters = [];
  activeCharacterId = null;
  activeSectionId = null;
  lastRenderedSectionId = null;
  showView("dashboard");
}

function renderCharacterSwitcher() {
  characterSelect.innerHTML = characters.length
    ? characters.map(c => `<option value="${c.id}" ${c.id === activeCharacterId ? "selected" : ""}>${escapeHtml(c.name || "Unnamed Character")}</option>`).join("")
    : `<option value="">NO CHARACTERS</option>`;
  characterSelect.disabled = characters.length === 0;
  $("#deleteCharacterBtn").disabled = characters.length === 0;
}

function renderCharacter(force = false) {
  const character = currentCharacter();
  const exists = !!character;
  noCharacters.classList.toggle("hidden", exists);
  characterWorkspace.classList.toggle("hidden", !exists);
  if (!character) return;

  characterSerial.textContent = `FILE ${character.id.slice(0, 4).toUpperCase()}`;

  if (force || document.activeElement !== charName) charName.value = character.name || "";
  if (force || document.activeElement !== charAge) charAge.value = character.age || "";
  if (force || document.activeElement !== charHeight) charHeight.value = character.height || "";

  const portrait = character.profileData || character.profileUrl || "";
  if (portrait) {
    portraitImage.src = portrait;
    portraitFrame.classList.add("has-image");
  } else {
    portraitImage.removeAttribute("src");
    portraitFrame.classList.remove("has-image");
  }

  renderCustomFields(character);
  renderSections(character, force);
}

function renderCustomFields(character) {
  const fields = Array.isArray(character.fields) ? character.fields : [];
  if (!fields.length) {
    customFields.innerHTML = `<div class="custom-empty">ADD WORLD, POWER, SPECIES, OCCUPATION, WEAPON, AFFILIATION — ANYTHING.</div>`;
    return;
  }

  customFields.innerHTML = fields.map(field => `
    <div class="custom-field" data-field-id="${field.id}">
      <input class="field-label" value="${escapeHtml(field.label || "")}" placeholder="LABEL" />
      <input class="field-value" value="${escapeHtml(field.value || "")}" placeholder="VALUE" />
      <button class="remove-mini" type="button" title="Remove field">×</button>
    </div>`).join("");
}

customFields.addEventListener("input", event => {
  const row = event.target.closest(".custom-field");
  if (!row) return;
  if (event.target.classList.contains("field-label")) updateCustomField(row.dataset.fieldId, "label", event.target.value);
  if (event.target.classList.contains("field-value")) updateCustomField(row.dataset.fieldId, "value", event.target.value);
});
customFields.addEventListener("click", event => {
  const button = event.target.closest(".remove-mini");
  const row = button?.closest(".custom-field");
  if (row) removeCustomField(row.dataset.fieldId);
});

function normaliseSections(character) {
  const raw = Array.isArray(character.sections) ? character.sections : [];
  return raw.map(section => ({
    ...section,
    id: section.id || uid(),
    title: section.title || "Untitled Section",
    contentHtml: section.contentHtml ?? plainTextToHtml(section.content || "")
  }));
}

function plainTextToHtml(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function renderSections(character, force = false) {
  let sections = normaliseSections(character);
  if (!sections.length) {
    sections = [
      { id: uid(), title: "Personality", contentHtml: "" },
      { id: uid(), title: "Backstory", contentHtml: "" }
    ];
    character.sections = sections;
    scheduleCharacterSave({ sections });
  }

  if (!activeSectionId || !sections.some(s => s.id === activeSectionId)) {
    activeSectionId = sections[0].id;
    lastRenderedSectionId = null;
  }

  sectionList.innerHTML = sections.map(section => `
    <button class="section-tab ${section.id === activeSectionId ? "active" : ""}" type="button" data-section-id="${section.id}">
      ${escapeHtml(section.title || "Untitled Section")}
    </button>`).join("");

  const active = sections.find(section => section.id === activeSectionId);
  if (!active) return;

  if (force || document.activeElement !== sectionTitleInput) sectionTitleInput.value = active.title || "";

  const sectionChanged = lastRenderedSectionId !== activeSectionId;
  if (force || sectionChanged || document.activeElement !== sectionContent) {
    sectionContent.innerHTML = sanitiseHtml(active.contentHtml || "");
    lastRenderedSectionId = activeSectionId;
  }

  $("#deleteSectionBtn").disabled = sections.length <= 1;
}

sectionList.addEventListener("click", event => {
  const tab = event.target.closest(".section-tab");
  if (!tab) return;
  flushPendingSave();
  activeSectionId = tab.dataset.sectionId;
  lastRenderedSectionId = null;
  renderSections(currentCharacter(), true);
});

async function createCharacter() {
  if (!currentStoryId) return;
  const result = await openModal({
    eyebrow: "// NEW CHARACTER FILE",
    title: "ADD CHARACTER",
    description: "This name belongs only to the character. It will not rename the story file.",
    label: "CHARACTER NAME",
    placeholder: "Robert Storm",
    submit: "ADD CHARACTER"
  });
  if (!result) return;

  try {
    const created = await addDoc(collection(db, "stories", currentStoryId, "characters"), {
      name: result.value,
      age: "",
      height: "",
      profileData: "",
      fields: [],
      sections: [
        { id: uid(), title: "Personality", contentHtml: "" },
        { id: uid(), title: "Backstory", contentHtml: "" },
        { id: uid(), title: "Abilities", contentHtml: "" }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    activeCharacterId = created.id;
    activeSectionId = null;
    lastRenderedSectionId = null;
    toast("Character file created.");
  } catch (error) {
    console.error(error);
    toast("Could not add the character.", "error");
  }
}

function scheduleCharacterSave(patch) {
  const character = currentCharacter();
  if (!character || !currentStoryId || !activeCharacterId) return;
  Object.assign(character, patch);

  if (pendingSave && (pendingSave.storyId !== currentStoryId || pendingSave.characterId !== activeCharacterId)) {
    flushPendingSave();
  }

  pendingSave = {
    storyId: currentStoryId,
    characterId: activeCharacterId,
    patch: { ...(pendingSave?.patch || {}), ...patch }
  };

  clearTimeout(saveTimer);
  setSaveState("saving", "SAVING…");
  saveTimer = setTimeout(flushPendingSave, 600);
}

async function flushPendingSave() {
  clearTimeout(saveTimer);
  if (!pendingSave) return;

  const payload = pendingSave;
  pendingSave = null;

  try {
    await updateDoc(doc(db, "stories", payload.storyId, "characters", payload.characterId), {
      ...payload.patch,
      updatedAt: serverTimestamp()
    });
    setSaveState("saved", "SAVED");
  } catch (error) {
    console.error(error);
    setSaveState("error", "SAVE FAILED");
    toast("A change could not be saved.", "error");
  }
}

async function updateCharacterNow(patch) {
  const character = currentCharacter();
  if (!character || !currentStoryId || !activeCharacterId) return;
  Object.assign(character, patch);
  try {
    setSaveState("saving", "SAVING…");
    await updateDoc(doc(db, "stories", currentStoryId, "characters", activeCharacterId), {
      ...patch,
      updatedAt: serverTimestamp()
    });
    setSaveState("saved", "SAVED");
  } catch (error) {
    console.error(error);
    setSaveState("error", "SAVE FAILED");
    toast("A change could not be saved.", "error");
  }
}

function updateCustomField(fieldId, key, value) {
  const character = currentCharacter();
  if (!character) return;
  const fields = (character.fields || []).map(field => field.id === fieldId ? { ...field, [key]: value } : field);
  character.fields = fields;
  scheduleCharacterSave({ fields });
}

async function addCustomField() {
  const character = currentCharacter();
  if (!character) return;
  const result = await openModal({
    eyebrow: "// EXTRA DATA",
    title: "ADD FIELD",
    description: "Create any extra character property you need.",
    label: "FIELD NAME",
    placeholder: "Power",
    submit: "ADD FIELD"
  });
  if (!result) return;

  const fields = [...(character.fields || []), { id: uid(), label: result.value, value: "" }];
  await updateCharacterNow({ fields });
}

async function removeCustomField(fieldId) {
  const character = currentCharacter();
  if (!character) return;
  const fields = (character.fields || []).filter(field => field.id !== fieldId);
  await updateCharacterNow({ fields });
}

async function addSection() {
  const character = currentCharacter();
  if (!character) return;
  const result = await openModal({
    eyebrow: "// FILE NAVIGATION",
    title: "ADD SECTION",
    description: "The new section becomes a tab in the navigation bar above the character file.",
    label: "SECTION TITLE",
    placeholder: "Relationships",
    submit: "ADD SECTION"
  });
  if (!result) return;

  const sections = normaliseSections(character);
  const section = { id: uid(), title: result.value, contentHtml: "" };
  sections.push(section);
  activeSectionId = section.id;
  lastRenderedSectionId = null;
  await updateCharacterNow({ sections });
  renderSections(character, true);
}

async function deleteActiveSection() {
  const character = currentCharacter();
  if (!character) return;
  const sections = normaliseSections(character);
  if (sections.length <= 1) return;
  if (!confirm("Delete this section and all of its text?")) return;

  const next = sections.filter(section => section.id !== activeSectionId);
  activeSectionId = next[0]?.id || null;
  lastRenderedSectionId = null;
  await updateCharacterNow({ sections: next });
  renderSections(character, true);
}

function updateActiveSection(key, value) {
  const character = currentCharacter();
  if (!character) return;
  const sections = normaliseSections(character).map(section =>
    section.id === activeSectionId ? { ...section, [key]: value } : section
  );
  character.sections = sections;
  scheduleCharacterSave({ sections });

  if (key === "title") {
    const tab = sectionList.querySelector(`[data-section-id="${CSS.escape(activeSectionId)}"]`);
    if (tab) tab.textContent = value || "Untitled Section";
  }
}

async function uploadCharacterPortrait(file) {
  if (!file || !currentStoryId || !activeCharacterId) return;
  try {
    setSync("", "Processing image");
    setSaveState("saving", "PROCESSING IMAGE…");
    const profileData = await fileToCompressedDataUrl(file, { maxWidth: 900, maxHeight: 1100, maxBytes: 300000 });
    await updateCharacterNow({ profileData });
    portraitImage.src = profileData;
    portraitFrame.classList.add("has-image");
    setSync("online", "Synced");
    toast("Portrait saved directly in Firestore.");
  } catch (error) {
    console.error(error);
    setSync("error", "Image failed");
    toast(error.message || "Could not process the portrait.", "error");
  } finally {
    portraitInput.value = "";
  }
}

async function editStorySettings() {
  if (!currentStoryId || !currentStory) return;
  const result = await openModal({
    eyebrow: "// STORY FILE SETTINGS",
    title: "EDIT STORY FILE",
    description: "This changes the story/file name only. Character names stay untouched.",
    label: "STORY / FILE NAME",
    placeholder: "Story title",
    value: currentStory.title || "",
    submit: "SAVE STORY",
    showUpload: true,
    uploadText: "OPTIONAL REPLACEMENT COVER"
  });
  if (!result) return;

  try {
    const patch = { title: result.value, updatedAt: serverTimestamp() };
    if (result.file) {
      setSync("", "Processing cover");
      patch.coverData = await fileToCompressedDataUrl(result.file, { maxWidth: 1500, maxHeight: 900, maxBytes: 470000 });
    }
    await updateDoc(doc(db, "stories", currentStoryId), patch);
    setSync("online", "Synced");
    toast("Story file updated.");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not update the story.", "error");
  }
}

async function deleteCurrentCharacter() {
  if (!currentStoryId || !activeCharacterId) return;
  const character = currentCharacter();
  if (!confirm(`Delete ${character?.name || "this character"}? This cannot be undone.`)) return;
  try {
    flushPendingSave();
    await deleteDoc(doc(db, "stories", currentStoryId, "characters", activeCharacterId));
    activeCharacterId = null;
    activeSectionId = null;
    lastRenderedSectionId = null;
    toast("Character file deleted.");
  } catch (error) {
    console.error(error);
    toast("Could not delete the character.", "error");
  }
}

async function deleteCurrentStory() {
  if (!currentStoryId) return;
  if (!confirm("Delete this story file and all currently loaded character files? This cannot be undone.")) return;
  try {
    flushPendingSave();
    await Promise.all(characters.map(character =>
      deleteDoc(doc(db, "stories", currentStoryId, "characters", character.id))
    ));
    await deleteDoc(doc(db, "stories", currentStoryId));
    toast("Story file deleted.");
    goHome();
  } catch (error) {
    console.error(error);
    toast("Could not delete the story.", "error");
  }
}

function sanitiseHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const blocked = ["script", "style", "iframe", "object", "embed", "link", "meta", "form", "input", "button", "textarea", "select"];
  blocked.forEach(selector => template.content.querySelectorAll(selector).forEach(el => el.remove()));

  template.content.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) el.removeAttribute(attr.name);
      if (name === "style") {
        const safeStyles = attr.value.split(";").map(rule => rule.trim()).filter(rule => {
          const prop = rule.split(":")[0]?.trim().toLowerCase();
          return ["background-color", "font-weight", "font-style", "text-decoration"].includes(prop);
        });
        if (safeStyles.length) el.setAttribute("style", safeStyles.join("; "));
        else el.removeAttribute("style");
      }
    });
  });

  return template.innerHTML;
}

function saveEditorSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (sectionContent.contains(range.commonAncestorContainer)) savedSelection = range.cloneRange();
}

function restoreEditorSelection() {
  if (!savedSelection) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedSelection);
}

function applyFormat(command) {
  sectionContent.focus();
  restoreEditorSelection();
  if (command === "highlight") {
    document.execCommand("hiliteColor", false, "#7a5424");
  } else if (command === "bullet") {
    document.execCommand("insertUnorderedList", false, null);
  } else {
    document.execCommand(command, false, null);
  }
  saveEditorSelection();
  updateActiveSection("contentHtml", sanitiseHtml(sectionContent.innerHTML));
}

function blockForNode(node) {
  let el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (el && el !== sectionContent) {
    if (["DIV", "P", "LI"].includes(el.tagName)) return el;
    el = el.parentElement;
  }
  return sectionContent;
}

function textBeforeCaretWithin(block, range) {
  const probe = document.createRange();
  probe.selectNodeContents(block);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString();
}

function convertDashToBullet(event) {
  if (event.key !== " " || event.ctrlKey || event.metaKey || event.altKey) return;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!sectionContent.contains(range.startContainer)) return;

  const block = blockForNode(range.startContainer);
  if (!block || block.tagName === "LI") return;
  const before = textBeforeCaretWithin(block, range);
  if (before !== "-") return;

  event.preventDefault();
  const remove = document.createRange();
  remove.selectNodeContents(block);
  remove.setEnd(range.startContainer, range.startOffset);
  remove.deleteContents();

  const place = document.createRange();
  place.selectNodeContents(block);
  place.collapse(true);
  selection.removeAllRanges();
  selection.addRange(place);
  document.execCommand("insertUnorderedList", false, null);
  updateActiveSection("contentHtml", sanitiseHtml(sectionContent.innerHTML));
}

$$('.format-btn').forEach(button => {
  button.addEventListener("mousedown", event => {
    event.preventDefault();
    applyFormat(button.dataset.command);
  });
});
sectionContent.addEventListener("mouseup", saveEditorSelection);
sectionContent.addEventListener("keyup", saveEditorSelection);
sectionContent.addEventListener("keydown", convertDashToBullet);
sectionContent.addEventListener("input", () => {
  updateActiveSection("contentHtml", sanitiseHtml(sectionContent.innerHTML));
  saveEditorSelection();
});
sectionContent.addEventListener("paste", event => {
  // Paste as plain text so public collaborators cannot inject scripts/styles.
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") || "";
  document.execCommand("insertText", false, text);
});

storySearch.addEventListener("input", renderStories);
sortSelect.addEventListener("change", renderStories);
$("#newStoryBtn").addEventListener("click", createStory);
$("#emptyNewStoryBtn").addEventListener("click", createStory);
$("#homeBtn").addEventListener("click", goHome);
$("#backBtn").addEventListener("click", goHome);
$("#newCharacterBtn").addEventListener("click", createCharacter);
$("#emptyNewCharacterBtn").addEventListener("click", createCharacter);
$("#deleteCharacterBtn").addEventListener("click", deleteCurrentCharacter);
$("#storySettingsBtn").addEventListener("click", editStorySettings);
$("#deleteStoryBtn").addEventListener("click", deleteCurrentStory);
$("#addFieldBtn").addEventListener("click", addCustomField);
$("#addSectionBtn").addEventListener("click", addSection);
$("#deleteSectionBtn").addEventListener("click", deleteActiveSection);

characterSelect.addEventListener("change", () => {
  flushPendingSave();
  activeCharacterId = characterSelect.value;
  activeSectionId = null;
  lastRenderedSectionId = null;
  renderCharacter(true);
});

charName.addEventListener("input", () => scheduleCharacterSave({ name: charName.value }));
charAge.addEventListener("input", () => scheduleCharacterSave({ age: charAge.value }));
charHeight.addEventListener("input", () => scheduleCharacterSave({ height: charHeight.value }));
sectionTitleInput.addEventListener("input", () => updateActiveSection("title", sectionTitleInput.value));
portraitInput.addEventListener("change", () => uploadCharacterPortrait(portraitInput.files[0]));

window.addEventListener("beforeunload", () => {
  if (pendingSave) flushPendingSave();
});

// Public mode: no Authentication required. Anyone with the site URL can read/edit.
setSync("", "Connecting");
subscribeToStories();
