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
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";

// 1) Replace this object with the config from:
// Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.
const firebaseConfig = {
    apiKey: "AIzaSyAAOVSAJ6C4l9GvvQB0_2ZNkAYt1UTrcnY",
    authDomain: "storieswith.firebaseapp.com",
    databaseURL: "https://storieswith-default-rtdb.firebaseio.com",
    projectId: "storieswith",
    storageBucket: "storieswith.firebasestorage.app",
    messagingSenderId: "811341249061",
    appId: "1:811341249061:web:282d5fa5ca99199ab3ddcc",
    measurementId: "G-5RXTPT9XTZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
let unsubscribeStories = null;
let unsubscribeStory = null;
let unsubscribeCharacters = null;
let modalMode = null;
let modalResolver = null;
let saveTimer = null;

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;","\"":"&quot;"}[c]));
const safeFileName = (name = "image") => name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
const timestampToMs = (value) => value?.toMillis?.() || 0;
const currentCharacter = () => characters.find(c => c.id === activeCharacterId) || null;

function setSync(status, text) {
  syncPill.classList.remove("online", "error");
  if (status) syncPill.classList.add(status);
  syncText.textContent = text;
}

function toast(message, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`.trim();
  el.textContent = message;
  $("#toastStack").append(el);
  setTimeout(() => el.remove(), 3200);
}

function showView(name) {
  dashboardView.classList.toggle("active", name === "dashboard");
  editorView.classList.toggle("active", name === "editor");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(mode, options = {}) {
  modalMode = mode;
  modalEyebrow.textContent = options.eyebrow || "CREATE";
  modalTitle.textContent = options.title || "New item";
  modalDescription.textContent = options.description || "";
  modalInputLabel.textContent = options.label || "Name";
  modalInput.placeholder = options.placeholder || "";
  modalInput.value = options.value || "";
  modalSubmit.textContent = options.submit || "Create";
  modalUploadWrap.classList.toggle("hidden", !options.showUpload);
  modalFile.value = "";
  modalFileName.textContent = options.uploadText || "Optional";
  modalBackdrop.classList.remove("hidden");
  setTimeout(() => modalInput.focus(), 40);

  return new Promise(resolve => { modalResolver = resolve; });
}

function closeModal(result = null) {
  modalBackdrop.classList.add("hidden");
  modalForm.reset();
  modalFileName.textContent = "Optional";
  if (modalResolver) modalResolver(result);
  modalResolver = null;
  modalMode = null;
}

modalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = modalInput.value.trim();
  if (!value) return;
  closeModal({ value, file: modalFile.files[0] || null, mode: modalMode });
});
$("#modalCancel").addEventListener("click", () => closeModal());
$("#modalClose").addEventListener("click", () => closeModal());
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});
modalFile.addEventListener("change", () => {
  modalFileName.textContent = modalFile.files[0]?.name || "Optional";
});

document.addEventListener("keydown", (event) => {
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
    const coverStyle = story.coverUrl ? `style="background-image:url('${escapeHtml(story.coverUrl)}')"` : "";
    const created = story.createdAt?.toDate?.();
    const dateText = created ? created.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Just now";
    return `
      <button class="story-card ${story.coverUrl ? "" : "no-cover"}" data-story-id="${story.id}">
        <div class="story-card-cover" ${coverStyle}></div>
        <div class="story-card-arrow">↗</div>
        <div class="story-card-content">
          <span class="story-card-kicker">STORY</span>
          <h3>${escapeHtml(story.title || "Untitled Story")}</h3>
          <div class="story-card-meta">Created ${escapeHtml(dateText)}</div>
        </div>
      </button>`;
  }).join("");

  emptyStories.classList.toggle("hidden", stories.length > 0 || search.length > 0);
  storyGrid.classList.toggle("hidden", filtered.length === 0);

  $$(".story-card").forEach(card => card.addEventListener("click", () => openStory(card.dataset.storyId)));
}

function subscribeToStories() {
  unsubscribeStories?.();
  unsubscribeStories = onSnapshot(collection(db, "stories"), snapshot => {
    stories = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderStories();
    setSync("online", "Synced");
  }, error => {
    console.error(error);
    setSync("error", "Sync error");
    toast("Could not load stories. Check Firebase setup and rules.", "error");
  });
}

async function createStory() {
  const result = await openModal("new-story", {
    eyebrow: "NEW UNIVERSE",
    title: "Create a story",
    description: "This becomes a card on your shared story index.",
    label: "Story title",
    placeholder: "The Last Kingdom",
    submit: "Create story",
    showUpload: true,
    uploadText: "Optional cover image"
  });
  if (!result) return;

  try {
    setSync("", "Saving…");
    const refDoc = await addDoc(collection(db, "stories"), {
      title: result.value,
      coverUrl: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    if (result.file) {
      const imageRef = ref(storage, `stories/${refDoc.id}/cover-${Date.now()}-${safeFileName(result.file.name)}`);
      await uploadBytes(imageRef, result.file);
      const coverUrl = await getDownloadURL(imageRef);
      await updateDoc(refDoc, { coverUrl, updatedAt: serverTimestamp() });
    }

    toast("Story created.");
    openStory(refDoc.id);
  } catch (error) {
    console.error(error);
    toast("Could not create the story.", "error");
    setSync("error", "Save failed");
  }
}

function openStory(storyId) {
  currentStoryId = storyId;
  activeCharacterId = null;
  activeSectionId = null;
  showView("editor");

  unsubscribeStory?.();
  unsubscribeCharacters?.();

  unsubscribeStory = onSnapshot(doc(db, "stories", storyId), snap => {
    if (!snap.exists()) {
      goHome();
      return;
    }
    currentStory = { id: snap.id, ...snap.data() };
    storyTitle.textContent = currentStory.title || "Untitled Story";
  });

  unsubscribeCharacters = onSnapshot(collection(db, "stories", storyId, "characters"), snapshot => {
    characters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    if (!activeCharacterId || !characters.some(c => c.id === activeCharacterId)) {
      activeCharacterId = characters[0]?.id || null;
    }
    renderCharacterSwitcher();
    renderCharacter();
  }, error => {
    console.error(error);
    toast("Could not load characters.", "error");
  });
}

function goHome() {
  unsubscribeStory?.();
  unsubscribeCharacters?.();
  unsubscribeStory = null;
  unsubscribeCharacters = null;
  currentStoryId = null;
  currentStory = null;
  characters = [];
  activeCharacterId = null;
  activeSectionId = null;
  showView("dashboard");
}

function renderCharacterSwitcher() {
  characterSelect.innerHTML = characters.length
    ? characters.map(c => `<option value="${c.id}" ${c.id === activeCharacterId ? "selected" : ""}>${escapeHtml(c.name || "Unnamed Character")}</option>`).join("")
    : `<option>No characters yet</option>`;
  characterSelect.disabled = characters.length === 0;
  $("#deleteCharacterBtn").disabled = characters.length === 0;
}

function renderCharacter() {
  const character = currentCharacter();
  const hasCharacter = !!character;
  noCharacters.classList.toggle("hidden", hasCharacter);
  characterWorkspace.classList.toggle("hidden", !hasCharacter);
  if (!character) return;

  charName.value = character.name || "";
  charAge.value = character.age || "";
  charHeight.value = character.height || "";

  if (character.profileUrl) {
    portraitImage.src = character.profileUrl;
    portraitFrame.classList.add("has-image");
  } else {
    portraitImage.removeAttribute("src");
    portraitFrame.classList.remove("has-image");
  }

  renderCustomFields(character);
  renderSections(character);
}

function renderCustomFields(character) {
  const fields = Array.isArray(character.fields) ? character.fields : [];
  if (!fields.length) {
    customFields.innerHTML = `<div style="color:#6f788c;font-size:11px;padding:5px 2px 8px;">Use ＋ to add World, Powers, Species, Occupation, or anything else.</div>`;
    return;
  }

  customFields.innerHTML = fields.map(field => `
    <div class="custom-field" data-field-id="${field.id}">
      <input class="field-label" value="${escapeHtml(field.label || "")}" placeholder="Label" />
      <input class="field-value" value="${escapeHtml(field.value || "")}" placeholder="Value" />
      <button class="remove-mini" type="button" title="Remove field">×</button>
    </div>`).join("");

  $$(".custom-field").forEach(row => {
    const id = row.dataset.fieldId;
    row.querySelector(".field-label").addEventListener("input", e => updateCustomField(id, "label", e.target.value));
    row.querySelector(".field-value").addEventListener("input", e => updateCustomField(id, "value", e.target.value));
    row.querySelector(".remove-mini").addEventListener("click", () => removeCustomField(id));
  });
}

function renderSections(character) {
  let sections = Array.isArray(character.sections) ? character.sections : [];
  if (!sections.length) {
    sections = [{ id: uid(), title: "Overview", content: "" }];
    updateCharacter({ sections });
  }

  if (!activeSectionId || !sections.some(s => s.id === activeSectionId)) {
    activeSectionId = sections[0]?.id || null;
  }

  sectionList.innerHTML = sections.map((section, index) => `
    <button class="section-link ${section.id === activeSectionId ? "active" : ""}" data-section-id="${section.id}">
      <span>${escapeHtml(section.title || "Untitled Section")}</span>
      <span class="section-index">${String(index + 1).padStart(2, "0")}</span>
    </button>`).join("");

  $$(".section-link").forEach(button => button.addEventListener("click", () => {
    activeSectionId = button.dataset.sectionId;
    renderSections(currentCharacter());
  }));

  const active = sections.find(s => s.id === activeSectionId);
  sectionTitleInput.value = active?.title || "";
  sectionContent.value = active?.content || "";
  $("#deleteSectionBtn").disabled = sections.length <= 1;
}

async function createCharacter() {
  if (!currentStoryId) return;
  const result = await openModal("new-character", {
    eyebrow: "NEW CHARACTER",
    title: "Add someone to the cast",
    description: "You can fill in everything else after creating them.",
    label: "Character name",
    placeholder: "Aria Vale",
    submit: "Add character"
  });
  if (!result) return;

  try {
    const created = await addDoc(collection(db, "stories", currentStoryId, "characters"), {
      name: result.value,
      age: "",
      height: "",
      profileUrl: "",
      fields: [],
      sections: [
        { id: uid(), title: "Personality", content: "" },
        { id: uid(), title: "Backstory", content: "" }
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    activeCharacterId = created.id;
    activeSectionId = null;
    toast("Character added.");
  } catch (error) {
    console.error(error);
    toast("Could not add the character.", "error");
  }
}

function scheduleCharacterSave(patch) {
  const character = currentCharacter();
  if (!character) return;
  Object.assign(character, patch);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => updateCharacter(patch), 550);
}

async function updateCharacter(patch) {
  if (!currentStoryId || !activeCharacterId) return;
  try {
    await updateDoc(doc(db, "stories", currentStoryId, "characters", activeCharacterId), {
      ...patch,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
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
  const result = await openModal("new-field", {
    eyebrow: "CUSTOM INFO",
    title: "Add a profile field",
    description: "Examples: World, Power, Species, Occupation, Weapon.",
    label: "Field name",
    placeholder: "Power",
    submit: "Add field"
  });
  if (!result) return;

  const fields = [...(character.fields || []), { id: uid(), label: result.value, value: "" }];
  await updateCharacter({ fields });
}

async function removeCustomField(fieldId) {
  const character = currentCharacter();
  if (!character) return;
  const fields = (character.fields || []).filter(field => field.id !== fieldId);
  await updateCharacter({ fields });
}

async function addSection() {
  const character = currentCharacter();
  if (!character) return;
  const result = await openModal("new-section", {
    eyebrow: "NAVIGATION",
    title: "Add a new section",
    description: "This will appear in the character navbar on the right.",
    label: "Section title",
    placeholder: "Relationships",
    submit: "Add section"
  });
  if (!result) return;

  const section = { id: uid(), title: result.value, content: "" };
  const sections = [...(character.sections || []), section];
  activeSectionId = section.id;
  await updateCharacter({ sections });
}

async function deleteActiveSection() {
  const character = currentCharacter();
  if (!character || (character.sections || []).length <= 1) return;
  if (!confirm("Delete this section and its text?")) return;
  const sections = character.sections.filter(section => section.id !== activeSectionId);
  activeSectionId = sections[0]?.id || null;
  await updateCharacter({ sections });
}

function updateActiveSection(key, value) {
  const character = currentCharacter();
  if (!character) return;
  const sections = (character.sections || []).map(section => section.id === activeSectionId ? { ...section, [key]: value } : section);
  character.sections = sections;
  scheduleCharacterSave({ sections });
  if (key === "title") {
    const button = document.querySelector(`[data-section-id="${activeSectionId}"] span:first-child`);
    if (button) button.textContent = value || "Untitled Section";
  }
}

async function uploadCharacterPortrait(file) {
  if (!file || !currentStoryId || !activeCharacterId) return;
  try {
    setSync("", "Uploading image…");
    const imageRef = ref(storage, `stories/${currentStoryId}/characters/${activeCharacterId}/profile-${Date.now()}-${safeFileName(file.name)}`);
    await uploadBytes(imageRef, file);
    const profileUrl = await getDownloadURL(imageRef);
    await updateCharacter({ profileUrl });
    setSync("online", "Synced");
    toast("Portrait updated.");
  } catch (error) {
    console.error(error);
    setSync("error", "Upload failed");
    toast("Could not upload the portrait.", "error");
  } finally {
    portraitInput.value = "";
  }
}

async function editStorySettings() {
  if (!currentStoryId || !currentStory) return;
  const result = await openModal("story-settings", {
    eyebrow: "STORY SETTINGS",
    title: "Edit story",
    description: "Rename the story or replace its cover image.",
    label: "Story title",
    placeholder: "Story title",
    value: currentStory.title || "",
    submit: "Save changes",
    showUpload: true,
    uploadText: "Leave empty to keep current cover"
  });
  if (!result) return;

  try {
    const patch = { title: result.value, updatedAt: serverTimestamp() };
    if (result.file) {
      setSync("", "Uploading cover…");
      const imageRef = ref(storage, `stories/${currentStoryId}/cover-${Date.now()}-${safeFileName(result.file.name)}`);
      await uploadBytes(imageRef, result.file);
      patch.coverUrl = await getDownloadURL(imageRef);
    }
    await updateDoc(doc(db, "stories", currentStoryId), patch);
    toast("Story updated.");
  } catch (error) {
    console.error(error);
    toast("Could not update the story.", "error");
  }
}

async function deleteCurrentCharacter() {
  if (!currentStoryId || !activeCharacterId) return;
  const character = currentCharacter();
  if (!confirm(`Delete ${character?.name || "this character"}? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "stories", currentStoryId, "characters", activeCharacterId));
    activeCharacterId = null;
    activeSectionId = null;
    toast("Character deleted.");
  } catch (error) {
    console.error(error);
    toast("Could not delete the character.", "error");
  }
}

async function deleteCurrentStory() {
  if (!currentStoryId) return;
  if (!confirm("Delete this story and all currently loaded character profiles? This cannot be undone.")) return;
  try {
    // Firestore does not automatically remove subcollections, so remove character docs first.
    await Promise.all(characters.map(character =>
      deleteDoc(doc(db, "stories", currentStoryId, "characters", character.id))
    ));
    await deleteDoc(doc(db, "stories", currentStoryId));
    toast("Story deleted.");
    goHome();
  } catch (error) {
    console.error(error);
    toast("Could not delete the story.", "error");
  }
}

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
  activeCharacterId = characterSelect.value;
  activeSectionId = null;
  renderCharacter();
});

charName.addEventListener("input", () => scheduleCharacterSave({ name: charName.value }));
charAge.addEventListener("input", () => scheduleCharacterSave({ age: charAge.value }));
charHeight.addEventListener("input", () => scheduleCharacterSave({ height: charHeight.value }));
sectionTitleInput.addEventListener("input", () => updateActiveSection("title", sectionTitleInput.value));
sectionContent.addEventListener("input", () => updateActiveSection("content", sectionContent.value));
portraitInput.addEventListener("change", () => uploadCharacterPortrait(portraitInput.files[0]));

// Public mode: no login required.
// Anyone who can open the site can load and edit the shared stories.
setSync("", "Connecting…");
subscribeToStories();
