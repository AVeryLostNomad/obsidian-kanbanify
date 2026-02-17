const {
  ItemView,
  Notice,
  Plugin,
  Modal,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  FuzzySuggestModal,
  setIcon
} = require("obsidian");

const VIEW_TYPE = "kanbanify-view";
const STATUS_FIELD = "kanbanStatus";
const TYPE_FIELD = "kanbanType";
const PRIORITY_FIELD = "kanbanPriority";
const BOARD_FIELD = "kanbanBoard";
const LANES_FIELD = "kanbanLanes";
const FOLDER_FIELD = "kanbanFolder";
const DEFAULT_LANE_FIELD = "kanbanDefaultLane";
const CARD_TYPES_FIELD = "kanbanTypes";
const DONE_LANE_FIELD = "kanbanDoneLane";
const HIDE_DONE_AFTER_FIELD = "kanbanHideDoneAfter";
const MOVED_AT_FIELD = "kanbanMovedAt";

const DEFAULT_SETTINGS = {
  notesFolder: "Kanban",
  lanes: ["Backlog", "In Progress", "Done"],
  defaultLane: "Backlog",
  cardTypes: [
    { name: "Task", color: "#8b5cf6" },
    { name: "Bug", color: "#ef4444" },
    { name: "Story", color: "#22c55e" }
  ],
  lastSelectedType: ""
};

const PRIORITY_OPTIONS = [
  { id: "trivial", label: "Trivial", icon: "." },
  { id: "lowest", label: "Lowest", icon: "v" },
  { id: "lower", label: "Lower", icon: "vv" },
  { id: "low", label: "Low", icon: "vvv" },
  { id: "medium", label: "Medium", icon: "=" },
  { id: "high", label: "High", icon: "^" },
  { id: "higher", label: "Higher", icon: "^^" },
  { id: "highest", label: "Highest", icon: "^^^" },
  { id: "critical", label: "Critical", icon: "!" },
  { id: "blocker", label: "Blocker", icon: "X" }
];

const HIDE_DONE_OPTIONS = [
  "Never",
  "Immediately",
  "10 minutes",
  "One Day",
  "One Week",
  "Two Weeks"
];

function renderCardTypeEditor(containerEl, plugin) {
  const typesContainer = containerEl.createDiv("kanbanify-types");
  const renderTypes = () => {
    typesContainer.empty();
    const types = plugin.getCardTypes();
    types.forEach((type, index) => {
      const row = typesContainer.createDiv("kanbanify-type-row");
      const nameInput = row.createEl("input", {
        type: "text",
        cls: "kanbanify-type-name",
        value: type.name
      });
      const colorInput = row.createEl("input", {
        type: "color",
        cls: "kanbanify-type-color",
        value: type.color
      });
      const removeButton = row.createEl("button", {
        text: "Remove",
        cls: "kanbanify-type-remove"
      });

      nameInput.addEventListener("change", async () => {
        type.name = nameInput.value.trim() || type.name;
        plugin.settings.cardTypes[index] = type;
        await plugin.saveSettings();
        plugin.refreshViews();
        renderTypes();
      });
      colorInput.addEventListener("change", async () => {
        type.color = colorInput.value;
        plugin.settings.cardTypes[index] = type;
        await plugin.saveSettings();
        plugin.refreshViews();
      });
      removeButton.addEventListener("click", async () => {
        plugin.settings.cardTypes.splice(index, 1);
        await plugin.saveSettings();
        plugin.refreshViews();
        renderTypes();
      });
    });
  };
  renderTypes();
  const addButton = containerEl.createEl("button", {
    text: "Add card type",
    cls: "kanbanify-type-add"
  });
  addButton.addEventListener("click", async () => {
    plugin.settings.cardTypes.push({
      name: "New Type",
      color: "#0ea5e9"
    });
    await plugin.saveSettings();
    plugin.refreshViews();
    renderTypes();
  });
}

function renderCardTypeEditorForBoard(containerEl, types, onChange) {
  const typesContainer = containerEl.createDiv("kanbanify-types");
  const renderTypes = () => {
    typesContainer.empty();
    types.forEach((type, index) => {
      const row = typesContainer.createDiv("kanbanify-type-row");
      const nameInput = row.createEl("input", {
        type: "text",
        cls: "kanbanify-type-name",
        value: type.name
      });
      const colorInput = row.createEl("input", {
        type: "color",
        cls: "kanbanify-type-color",
        value: type.color
      });
      const removeButton = row.createEl("button", {
        text: "Remove",
        cls: "kanbanify-type-remove"
      });

      nameInput.addEventListener("change", () => {
        type.name = nameInput.value.trim() || type.name;
        onChange(types);
        renderTypes();
      });
      colorInput.addEventListener("change", () => {
        type.color = colorInput.value;
        onChange(types);
      });
      removeButton.addEventListener("click", () => {
        types.splice(index, 1);
        onChange(types);
        renderTypes();
      });
    });
  };
  renderTypes();
  const addButton = containerEl.createEl("button", {
    text: "Add card type",
    cls: "kanbanify-type-add"
  });
  addButton.addEventListener("click", () => {
    types.push({
      name: "New Type",
      color: "#0ea5e9"
    });
    onChange(types);
    renderTypes();
  });
}

function joinPath(base, child) {
  if (!base) return child || "";
  if (!child) return base;
  return `${base.replace(/\/$/, "")}/${child.replace(/^\//, "")}`;
}

class KanbanView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardEl = null;
    this.boardPath = null;
    this.renderVersion = 0;
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    const file = this.getBoardFile();
    return file ? file.basename : "Kanbanify Board";
  }

  getIcon() {
    return "layout-dashboard";
  }

  getState() {
    return { boardPath: this.boardPath };
  }

  async setState(state) {
    this.boardPath = state?.boardPath ?? null;
    await this.refresh();
  }

  getBoardFile() {
    if (!this.boardPath) return null;
    const file = this.app.vault.getAbstractFileByPath(this.boardPath);
    return file instanceof TFile ? file : null;
  }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass("kanbanify-view");
    this.boardEl = this.containerEl.createDiv("kanbanify-board");
    await this.refresh();
  }

  renderEmptyState() {
    if (!this.boardEl) return;
    this.boardEl.empty();
    const emptyEl = this.boardEl.createDiv("kanbanify-empty");
    emptyEl.createEl("h3", { text: "No board selected" });
    emptyEl.createEl("p", {
      text: "Open a Kanban board note to load its lanes."
    });
    const button = emptyEl.createEl("button", {
      cls: "kanbanify-empty-button",
      text: "Select board"
    });
    button.addEventListener("click", () => {
      this.plugin.openBoardPicker();
    });
  }

  async refresh() {
    if (!this.boardEl) return;
    if (this.plugin.closeInlinePopover) {
      this.plugin.closeInlinePopover();
    }

    const boardFile = this.getBoardFile();
    const renderToken = ++this.renderVersion;
    if (!boardFile) {
      if (typeof this.setTitle === "function") {
        this.setTitle("Kanbanify Board");
      }
      this.renderEmptyState();
      return;
    }

    const boardConfig = this.plugin.getBoardConfig(boardFile);
    if (!boardConfig) {
      if (typeof this.setTitle === "function") {
        this.setTitle("Kanbanify Board");
      }
      this.renderEmptyState();
      return;
    }

    this.boardEl.empty();
    if (typeof this.setTitle === "function") {
      this.setTitle(boardConfig.title);
    }

    const headerEl = this.boardEl.createDiv("kanbanify-board-header");
    headerEl.createDiv({
      cls: "kanbanify-board-title",
      text: boardConfig.title
    });
    const headerActions = headerEl.createDiv("kanbanify-board-actions");
    const editButton = headerActions.createEl("button", {
      cls: "kanbanify-board-action",
      attr: { "aria-label": "Edit board settings" }
    });
    setIcon(editButton, "settings");
    editButton.addEventListener("click", () => {
      this.plugin.openBoardSettings(boardFile);
    });

    const lanes = boardConfig.lanes;
    const notesByLane = await this.plugin.collectNotesByLane(boardConfig);
    if (renderToken !== this.renderVersion)
      return;
    const lanesEl = this.boardEl.createDiv("kanbanify-lanes");

    lanes.forEach((lane) => {
      const notes = notesByLane.get(lane) || [];
      const laneEl = lanesEl.createDiv("kanbanify-lane");
      const headerEl = laneEl.createDiv("kanbanify-lane-header");
      headerEl.createDiv({
        cls: "kanbanify-lane-title",
        text: `${lane} (${notes.length})`
      });
      const laneActions = headerEl.createDiv("kanbanify-lane-actions");
      const addButton = laneActions.createEl("button", {
        cls: "kanbanify-add",
        attr: { "aria-label": `Add note to ${lane}`, type: "button" }
      });
      setIcon(addButton, "plus");
      addButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.openInlineCreateMenu(addButton, lane, boardConfig);
      });
      const laneSettingsButton = laneActions.createEl("button", {
        cls: "kanbanify-lane-settings",
        attr: { "aria-label": `Rename ${lane}`, type: "button" }
      });
      setIcon(laneSettingsButton, "settings");
      laneSettingsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.openInlineLaneRenameMenu(laneSettingsButton, boardConfig.boardFile, lane);
      });

      const contentEl = laneEl.createDiv("kanbanify-lane-content");
      contentEl.addEventListener("dragenter", (event) => {
        event.preventDefault();
        contentEl.addClass("kanbanify-drop-target");
      });
      contentEl.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        contentEl.addClass("kanbanify-drop-target");
      });
      contentEl.addEventListener("dragleave", () => {
        contentEl.removeClass("kanbanify-drop-target");
      });
      contentEl.addEventListener("drop", (event) => {
        event.preventDefault();
        contentEl.removeClass("kanbanify-drop-target");
        this.plugin.handleDrop(event, lane, boardConfig);
      });

      notes.forEach((note) => {
        const cardHeader = contentEl.createDiv("kanbanify-card");
        cardHeader.setAttr("draggable", "true");
        cardHeader.setAttr("data-path", note.file.path);
        if (note.typeColor) {
          cardHeader.style.borderLeft = `4px solid ${note.typeColor}`;
        }
        const titleRow = cardHeader.createDiv("kanbanify-card-title-row");
        titleRow.createDiv({
          cls: "kanbanify-card-title",
          text: note.file.basename
        });
        if (note.priority) {
          const priorityButton = titleRow.createEl("button", {
            cls: "kanbanify-priority-button",
            attr: {
              "aria-label": `Priority ${note.priority.label}`,
              type: "button"
            }
          });
          priorityButton.setAttr("data-priority", note.priority.id);
          priorityButton.setAttr("title", note.priority.label);
          const icon = priorityButton.createSpan({
            cls: "kanbanify-priority-icon",
            text: note.priority.icon
          });
          icon.setAttr("data-priority", note.priority.id);
          priorityButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.openInlinePriorityMenu(priorityButton, note.file);
          });
        }
        const cardActions = cardHeader.createDiv("kanbanify-card-actions");
        const cardSettingsButton = cardActions.createEl("button", {
          cls: "kanbanify-card-settings",
          attr: { "aria-label": "Edit card type", type: "button" }
        });
        setIcon(cardSettingsButton, "settings");
        cardSettingsButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.plugin.openInlineCardSettingsMenu(cardSettingsButton, note.file, boardConfig);
        });
        const cardDeleteButton = cardActions.createEl("button", {
          cls: "kanbanify-card-delete",
          attr: { "aria-label": "Delete note", type: "button" }
        });
        setIcon(cardDeleteButton, "trash-2");
        cardDeleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.plugin.deleteNote(note.file);
        });
        if (note.preview) {
          const previewEl = cardHeader.createDiv("kanbanify-card-preview");
          previewEl.setText(note.preview);
        }
        if (note.typeLabel || note.movedAtLabel) {
          const footerEl = cardHeader.createDiv("kanbanify-card-footer");
          if (note.typeLabel) {
            const typeEl = footerEl.createDiv("kanbanify-card-type");
            typeEl.setText(note.typeLabel);
            if (note.typeColor) {
              typeEl.style.borderColor = note.typeColor;
              typeEl.style.color = note.typeColor;
            }
          }
          if (note.movedAtLabel) {
            const updatedEl = footerEl.createDiv("kanbanify-card-updated");
            updatedEl.createSpan({
              cls: "kanbanify-card-updated-date",
              text: note.movedAtLabel
            });
            if (note.movedAtTitle) {
              updatedEl.setAttr("title", note.movedAtTitle);
            }
          }
        }
        if (note.isDone) {
          cardHeader.addClass("kanbanify-card-done");
        }
        cardHeader.addEventListener("click", () => {
          this.plugin.openFile(note.file);
        });
        cardHeader.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("application/kanbanify-path", note.file.path);
          event.dataTransfer?.setData("text/plain", note.file.path);
          event.dataTransfer?.setData("text/uri-list", note.file.path);
          event.dataTransfer?.setDragImage(cardHeader, 10, 10);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });
      });
    });
  }
}

class BoardPickerModal extends FuzzySuggestModal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  getItems() {
    return this.plugin.getBoardFiles();
  }

  getItemText(item) {
    return item.basename;
  }

  onChooseItem(item) {
    this.plugin.openBoard(item);
  }
}

class TextPromptModal extends Modal {
  constructor(app, title, placeholder, initialValue) {
    super(app);
    this.titleText = title;
    this.placeholder = placeholder || "";
    this.initialValue = initialValue || "";
    this.resolve = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });
    const inputEl = contentEl.createEl("input", {
      type: "text",
      cls: "kanbanify-input",
      attr: { placeholder: this.placeholder }
    });
    inputEl.value = this.initialValue;
    inputEl.focus();
    inputEl.select();

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Create" });

    const submit = () => {
      const value = inputEl.value.trim();
      this.close();
      if (this.resolve) this.resolve(value.length > 0 ? value : null);
    };

    cancelButton.addEventListener("click", () => {
      this.close();
      if (this.resolve) this.resolve(null);
    });

    okButton.addEventListener("click", submit);
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TypePromptModal extends Modal {
  constructor(app, title, typeOptions, selectedType) {
    super(app);
    this.titleText = title;
    this.typeOptions = typeOptions || [];
    this.selectedType = selectedType || "";
    this.resolve = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });

    const nameEl = contentEl.createEl("input", {
      type: "text",
      cls: "kanbanify-input",
      attr: { placeholder: "Note title" }
    });
    nameEl.focus();

    const selectEl = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    selectEl.createEl("option", { text: "No type", value: "" });
    this.typeOptions.forEach((type) => {
      selectEl.createEl("option", { text: type.name, value: type.name });
    });
    if (this.selectedType) {
      selectEl.value = this.selectedType;
    }

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Create" });

    const submit = () => {
      const title = nameEl.value.trim();
      const type = selectEl.value.trim();
      this.close();
      if (this.resolve) this.resolve({ title: title || null, type });
    };

    cancelButton.addEventListener("click", () => {
      this.close();
      if (this.resolve) this.resolve({ title: null, type: "" });
    });

    okButton.addEventListener("click", submit);
    nameEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CardTypeModal extends Modal {
  constructor(app, plugin, file, boardConfig) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.boardConfig = boardConfig;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Card type" });

    const selectEl = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    selectEl.createEl("option", { text: "No type", value: "" });
    this.boardConfig.cardTypes.forEach((type) => {
      selectEl.createEl("option", { text: type.name, value: type.name });
    });
    const currentType = this.plugin.getType(this.file);
    if (currentType) {
      selectEl.value = currentType;
    }

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Save" });

    cancelButton.addEventListener("click", () => this.close());
    okButton.addEventListener("click", async () => {
      await this.plugin.setType(this.file, selectEl.value.trim());
      this.plugin.refreshViews();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class BoardSettingsModal extends Modal {
  constructor(app, plugin, boardFile) {
    super(app);
    this.plugin = plugin;
    this.boardFile = boardFile;
    this.resolve = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("kanbanify-board-settings");

    const boardConfig = this.plugin.getBoardConfig(this.boardFile);
    if (!boardConfig) {
      contentEl.createEl("p", { text: "Board settings unavailable." });
      return;
    }

    contentEl.createEl("h3", { text: "Board settings" });
    let types = boardConfig.cardTypes.map((type) => ({ ...type }));

    const folderLabel = contentEl.createEl("label", { text: "Notes folder" });
    const folderInput = contentEl.createEl("input", {
      type: "text",
      cls: "kanbanify-input"
    });
    folderInput.value = boardConfig.notesFolderInput || boardConfig.notesFolder;
    folderLabel.appendChild(folderInput);

    const lanesLabel = contentEl.createEl("label", { text: "Swimlanes" });
    const lanesInput = contentEl.createEl("textarea", {
      cls: "kanbanify-textarea"
    });
    lanesInput.value = boardConfig.lanes.join(", ");
    lanesLabel.appendChild(lanesInput);

    const defaultLabel = contentEl.createEl("label", { text: "Default lane" });
    const defaultSelect = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    defaultLabel.appendChild(defaultSelect);

    const refreshDefaultOptions = () => {
      defaultSelect.empty();
      const lanes = this.plugin.parseLanes(lanesInput.value) || [];
      lanes.forEach((lane) => defaultSelect.createEl("option", { text: lane, value: lane }));
      if (lanes.length === 0) {
        defaultSelect.createEl("option", { text: "No lanes", value: "" });
      }
      const target = lanes.includes(boardConfig.defaultLane)
        ? boardConfig.defaultLane
        : lanes[0] || "";
      defaultSelect.value = target;
    };
    refreshDefaultOptions();
    lanesInput.addEventListener("input", refreshDefaultOptions);

    const doneLabel = contentEl.createEl("label", { text: "Done column" });
    const doneSelect = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    doneLabel.appendChild(doneSelect);

    const hideLabel = contentEl.createEl("label", { text: "Hide in Done After" });
    const hideSelect = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    hideLabel.appendChild(hideSelect);
    HIDE_DONE_OPTIONS.forEach((option) => {
      hideSelect.createEl("option", { text: option, value: option });
    });
    hideSelect.value = boardConfig.hideDoneAfter || "Never";

    const refreshDoneOptions = () => {
      doneSelect.empty();
      const lanes = this.plugin.parseLanes(lanesInput.value) || [];
      lanes.forEach((lane) => doneSelect.createEl("option", { text: lane, value: lane }));
      doneSelect.createEl("option", { text: "None", value: "" });
      const defaultDone = lanes.includes("Done") ? "Done" : "";
      doneSelect.value = lanes.includes(boardConfig.doneLane)
        ? boardConfig.doneLane
        : defaultDone;
    };
    refreshDoneOptions();
    lanesInput.addEventListener("input", refreshDoneOptions);

    contentEl.createEl("h4", { text: "Card types" });
    renderCardTypeEditorForBoard(contentEl, types, (updated) => {
      types = updated;
    });

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Save" });

    cancelButton.addEventListener("click", () => {
      this.close();
    });

    okButton.addEventListener("click", async () => {
      const lanes = this.plugin.parseLanes(lanesInput.value) || [];
      if (lanes.length === 0) {
        new Notice("Please add at least one lane.");
        return;
      }
      const notesFolder = folderInput.value.trim();
      const defaultLane = defaultSelect.value || lanes[0];
      await this.plugin.updateBoardConfig(this.boardFile, {
        lanes,
        notesFolder,
        defaultLane,
        cardTypes: types,
        doneLane: doneSelect.value || "",
        hideDoneAfter: hideSelect.value || "Never"
      });
      this.plugin.refreshViews();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class CardTypeSelectModal extends Modal {
  constructor(app, typeOptions, currentType) {
    super(app);
    this.typeOptions = typeOptions || [];
    this.currentType = currentType || "";
    this.resolve = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Card type" });

    const selectEl = contentEl.createEl("select", {
      cls: "kanbanify-select"
    });
    selectEl.createEl("option", { text: "No type", value: "" });
    this.typeOptions.forEach((type) => {
      selectEl.createEl("option", { text: type.name, value: type.name });
    });
    if (this.currentType) {
      selectEl.value = this.currentType;
    }

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Save" });

    cancelButton.addEventListener("click", () => {
      this.close();
      if (this.resolve) this.resolve(null);
    });

    okButton.addEventListener("click", () => {
      const value = selectEl.value.trim();
      this.close();
      if (this.resolve) this.resolve(value);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class LaneRenameModal extends Modal {
  constructor(app, laneName) {
    super(app);
    this.laneName = laneName;
    this.resolve = null;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Rename lane" });

    const inputEl = contentEl.createEl("input", {
      type: "text",
      cls: "kanbanify-input",
      attr: { placeholder: "Lane name" }
    });
    inputEl.value = this.laneName;
    inputEl.focus();
    inputEl.select();

    const actionsEl = contentEl.createDiv("kanbanify-prompt-actions");
    const cancelButton = actionsEl.createEl("button", { text: "Cancel" });
    const okButton = actionsEl.createEl("button", { text: "Save" });

    cancelButton.addEventListener("click", () => {
      this.close();
      if (this.resolve) this.resolve(null);
    });

    okButton.addEventListener("click", () => {
      const value = inputEl.value.trim();
      this.close();
      if (this.resolve) this.resolve(value.length > 0 ? value : null);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class KanbanifySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Kanbanify Defaults" });
    containerEl.createEl("p", {
      text: "These defaults are used for new boards and when board frontmatter is missing."
    });

    new Setting(containerEl)
      .setName("Default notes folder")
      .setDesc("Notes inside this folder are tracked by default.")
      .addText((text) => {
        text.setPlaceholder("Kanban")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value.trim() || "Kanban";
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Default swimlanes")
      .setDesc("Comma-separated list of lane names for new boards.")
      .addText((text) => {
        text.setPlaceholder("Backlog, In Progress, Done")
          .setValue(this.plugin.settings.lanes.join(", "))
          .onChange(async (value) => {
            const lanes = value
              .split(",")
              .map((lane) => lane.trim())
              .filter((lane) => lane.length > 0);
            this.plugin.settings.lanes = lanes.length > 0 ? lanes : DEFAULT_SETTINGS.lanes;
            if (!this.plugin.settings.lanes.includes(this.plugin.settings.defaultLane)) {
              this.plugin.settings.defaultLane = this.plugin.settings.lanes[0];
            }
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          });
      });

    new Setting(containerEl)
      .setName("Default lane")
      .setDesc("Lane used for new notes or notes without a status.")
      .addDropdown((dropdown) => {
        const lanes = this.plugin.getLaneList();
        lanes.forEach((lane) => dropdown.addOption(lane, lane));
        dropdown.setValue(this.plugin.settings.defaultLane);
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultLane = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    containerEl.createEl("h3", { text: "Card types" });
    renderCardTypeEditor(containerEl, this.plugin);
  }
}

module.exports = class KanbanifyPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.lastActiveLeaf = null;
    this.suppressedBoardFiles = new Map();
    this.inlinePopover = null;
    this.debugDrops = false;
    this.lastDragPath = null;
    this.lastDragAt = 0;

    this.registerView(
      VIEW_TYPE,
      (leaf) => new KanbanView(leaf, this)
    );

    this.addRibbonIcon("layout-dashboard", "Open Kanban board", () => {
      this.openBoardFromActiveFileOrPicker();
    });

    this.addCommand({
      id: "open-kanbanify-active-board",
      name: "Open Kanban board for active file",
      callback: () => this.openBoardFromActiveFileOrPicker(true)
    });

    this.addCommand({
      id: "open-kanbanify-picker",
      name: "Open Kanban board",
      callback: () => this.openBoardPicker()
    });

    this.addCommand({
      id: "create-kanbanify-board",
      name: "Create Kanban board note",
      callback: () => this.createBoard()
    });

    this.addCommand({
      id: "toggle-kanbanify-drop-debug",
      name: "Toggle Kanbanify drop debug logging",
      callback: () => {
        this.debugDrops = !this.debugDrops;
        new Notice(`Kanbanify drop debug ${this.debugDrops ? "enabled" : "disabled"}.`);
      }
    });

    this.registerDomEvent(document, "dragstart", (event) => {
      const target = event.target;
      const el = target?.closest?.("[data-path]");
      const path = el?.getAttribute?.("data-path");
      if (path) {
        this.lastDragPath = path;
        this.lastDragAt = Date.now();
      }
    });

    this.registerDomEvent(document, "dragend", () => {
      this.lastDragPath = null;
      this.lastDragAt = 0;
    });

    this.addSettingTab(new KanbanifySettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile || file instanceof TFolder)) return;
        menu.addItem((item) => {
          item
            .setTitle("New Kanban board")
            .setIcon("layout-dashboard")
            .onClick(async () => {
              const folderPath =
                file instanceof TFolder ? file.path : file.parent?.path;
              await this.createBoardInFolder(folderPath || "");
            });
        });
      })
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => this.onVaultChange(file))
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => this.onVaultChange(file))
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => this.onVaultChange(file))
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => this.onVaultChange(file))
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => this.onVaultChange(file))
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        this.lastActiveLeaf = leaf || null;
        const targetLeaf = leaf || null;
        window.setTimeout(() => {
          this.ensureBoardViewForLeaf(targetLeaf);
        }, 50);
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!file || !(file instanceof TFile)) return;
        this.ensureBoardViewForFile(file);
      })
    );
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!Array.isArray(this.settings.lanes) || this.settings.lanes.length === 0) {
      this.settings.lanes = DEFAULT_SETTINGS.lanes.slice();
    }
    if (!this.settings.lanes.includes(this.settings.defaultLane)) {
      this.settings.defaultLane = this.settings.lanes[0];
    }
    if (!Array.isArray(this.settings.cardTypes) || this.settings.cardTypes.length === 0) {
      this.settings.cardTypes = DEFAULT_SETTINGS.cardTypes.map((type) => ({ ...type }));
    }
    if (typeof this.settings.lastSelectedType !== "string") {
      this.settings.lastSelectedType = "";
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getLaneList() {
    const lanes = Array.isArray(this.settings.lanes) ? this.settings.lanes : [];
    return lanes.length > 0 ? lanes : DEFAULT_SETTINGS.lanes;
  }

  getCardTypes() {
    if (!Array.isArray(this.settings.cardTypes) || this.settings.cardTypes.length === 0) {
      return DEFAULT_SETTINGS.cardTypes.map((type) => ({ ...type }));
    }
    return this.settings.cardTypes;
  }

  openBoardFromActiveFileOrPicker(onlyIfActive = false) {
    const file = this.app.workspace.getActiveFile();
    if (file && this.isBoardFile(file)) {
      this.openBoard(file, this.lastActiveLeaf);
      return;
    }
    if (onlyIfActive) {
      new Notice("Active note is not a Kanban board.");
      return;
    }
    this.openBoardPicker();
  }

  openBoardPicker() {
    const boards = this.getBoardFiles();
    if (boards.length === 0) {
      new Notice("No Kanban boards found. Create one from the command palette.");
      return;
    }
    new BoardPickerModal(this.app, this).open();
  }

  async openBoard(boardFile, targetLeaf) {
    const boardPath = boardFile.path;
    const existingLeaf = this.findBoardLeaf(boardPath);
    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      return;
    }
    const leaf = targetLeaf || this.app.workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { boardPath } });
  }

  findBoardLeaf(boardPath) {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).find((leaf) => {
      const view = leaf.view;
      return view instanceof KanbanView && view.boardPath === boardPath;
    });
  }

  refreshViews() {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (view instanceof KanbanView) {
        view.refresh();
      }
    });
  }

  refreshViewsForFile(file) {
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((leaf) => {
      const view = leaf.view;
      if (!(view instanceof KanbanView)) return;
      const boardFile = view.getBoardFile();
      if (!boardFile) return;
      if (boardFile.path === file.path) {
        view.refresh();
        return;
      }
      const boardConfig = this.getBoardConfig(boardFile);
      if (!boardConfig) return;
      if (this.isFileInFolder(file, boardConfig.notesFolder)) {
        view.refresh();
      }
    });
  }

  onVaultChange(file) {
    if (file instanceof TFile && file.extension === "md") {
      this.refreshViewsForFile(file);
    }
  }

  async ensureBoardViewForFile(file) {
    if (!file || !(file instanceof TFile)) return;
    const suppressedUntil = this.suppressedBoardFiles.get(file.path);
    if (suppressedUntil && Date.now() < suppressedUntil) {
      return;
    }
    const isBoard = await this.isBoardFileReliable(file);
    if (!isBoard) return;
    const fileLeaf = this.findLeafForFile(file);
    const existingLeaf = this.findBoardLeaf(file.path);
    if (existingLeaf) {
      this.app.workspace.revealLeaf(existingLeaf);
      if (fileLeaf && fileLeaf !== existingLeaf) {
        fileLeaf.detach();
      }
      return;
    }
    const leaf =
      fileLeaf ||
      this.lastActiveLeaf ||
      this.app.workspace.getLeaf(false);
    if (!leaf) return;
    const view = leaf.view;
    if (view instanceof KanbanView && view.boardPath === file.path) {
      return;
    }
    await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { boardPath: file.path } });
  }

  async ensureBoardViewForLeaf(leaf) {
    if (!leaf) return;
    const view = leaf.view;
    if (!view || typeof view.getViewType !== "function") return;
    if (view.getViewType() !== "markdown") return;
    const file = view.file || this.app.workspace.getActiveFile();
    if (!file) return;
    await this.ensureBoardViewForFile(file);
  }

  isBoardFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const value = cache?.frontmatter?.[BOARD_FIELD];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return false;
  }

  async isBoardFileReliable(file) {
    if (this.isBoardFile(file)) return true;
    const content = await this.app.vault.cachedRead(file);
    return this.parseBoardFrontmatter(content);
  }

  parseBoardFrontmatter(content) {
    if (!content || !content.startsWith("---")) return false;
    const lines = content.split(/\r?\n/);
    let endIndex = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === "---" || lines[i].trim() === "...") {
        endIndex = i;
        break;
      }
    }
    if (endIndex === -1) return false;
    for (let i = 1; i < endIndex; i += 1) {
      const line = lines[i];
      const match = line.match(/^kanbanBoard\s*:\s*(.+)\s*$/i);
      if (!match) continue;
      const raw = match[1].trim().toLowerCase();
      if (raw === "true" || raw === "yes") return true;
      if (raw === "false" || raw === "no") return false;
    }
    return false;
  }

  findLeafForFile(file) {
    if (!file) return null;
    return this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
      const view = leaf.view;
      return view?.file?.path === file.path;
    }) || null;
  }

  getBoardFiles() {
    return this.app.vault.getMarkdownFiles().filter((file) => this.isBoardFile(file));
  }

  getBoardConfig(boardFile) {
    if (!boardFile) return null;
    const cache = this.app.metadataCache.getFileCache(boardFile);
    const frontmatter = cache?.frontmatter ?? {};

    const lanes = this.parseLanes(frontmatter[LANES_FIELD]) || this.getLaneList();
    const notesFolderInput = typeof frontmatter[FOLDER_FIELD] === "string"
      ? frontmatter[FOLDER_FIELD]
      : this.settings.notesFolder;
    const notesFolder = this.resolveNotesFolder(boardFile, notesFolderInput);
    const defaultLane = typeof frontmatter[DEFAULT_LANE_FIELD] === "string"
      ? frontmatter[DEFAULT_LANE_FIELD]
      : this.settings.defaultLane;
    const cardTypes = this.parseCardTypes(frontmatter[CARD_TYPES_FIELD]) || this.getCardTypes();
    const doneLane = typeof frontmatter[DONE_LANE_FIELD] === "string"
      ? frontmatter[DONE_LANE_FIELD]
      : "";
    const hideDoneAfter = typeof frontmatter[HIDE_DONE_AFTER_FIELD] === "string"
      ? frontmatter[HIDE_DONE_AFTER_FIELD]
      : "Never";

    const finalLanes = lanes.length > 0 ? lanes : DEFAULT_SETTINGS.lanes.slice();
    const finalDefaultLane = finalLanes.includes(defaultLane) ? defaultLane : finalLanes[0];

    return {
      title: boardFile.basename,
      boardFile,
      lanes: finalLanes,
      notesFolder,
      notesFolderInput,
      defaultLane: finalDefaultLane,
      cardTypes,
      doneLane: finalLanes.includes(doneLane)
        ? doneLane
        : (finalLanes.includes("Done") ? "Done" : ""),
      hideDoneAfter
    };
  }

  parseLanes(value) {
    if (Array.isArray(value)) {
      return value.map((lane) => String(lane).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(",").map((lane) => lane.trim()).filter(Boolean);
    }
    return null;
  }

  parseCardTypes(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") {
            return { name: item, color: "#0ea5e9" };
          }
          if (item && typeof item === "object") {
            const name = typeof item.name === "string" ? item.name : "";
            const color = typeof item.color === "string" ? item.color : "#0ea5e9";
            if (!name) return null;
            return { name, color };
          }
          return null;
        })
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name, color: "#0ea5e9" }));
    }
    return null;
  }

  normalizeFolder(folder) {
    if (!folder) return "";
    return folder.replace(/[\\/]+$/, "");
  }

  resolveNotesFolder(boardFile, folder) {
    const normalized = this.normalizeFolder(folder);
    if (!normalized) return "";
    if (normalized.startsWith("/")) {
      return normalized.replace(/^\/+/, "");
    }
    if (normalized.startsWith("./")) {
      const boardDir = boardFile?.parent?.path || "";
      return this.normalizeFolder(joinPath(boardDir, normalized.replace(/^\.\//, "")));
    }
    const boardDir = boardFile?.parent?.path || "";
    return this.normalizeFolder(joinPath(boardDir, normalized));
  }

  isFileInFolder(file, folder) {
    const normalized = this.normalizeFolder(folder);
    if (!normalized) return false;
    return file.path.startsWith(normalized + "/");
  }

  getStatus(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const status = cache?.frontmatter?.[STATUS_FIELD];
    return typeof status === "string" ? status : null;
  }

  getMovedAt(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const movedAt = cache?.frontmatter?.[MOVED_AT_FIELD];
    if (typeof movedAt === "number") return movedAt;
    if (typeof movedAt === "string") {
      const parsed = Date.parse(movedAt);
      if (!Number.isNaN(parsed)) return parsed;
    }
    const fallback = file?.stat?.mtime;
    return typeof fallback === "number" ? fallback : null;
  }

  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  formatMovedAtLabel(timestamp) {
    const now = Date.now();
    const diffMs = Math.max(0, now - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    if (diffMs < minute) {
      return "just now";
    }
    if (diffMs < hour) {
      const minutes = Math.floor(diffMs / minute);
      const label = minutes === 1 ? "minute" : "minutes";
      return `${minutes} ${label} ago`;
    }
    if (diffMs < day) {
      const hours = Math.floor(diffMs / hour);
      const label = hours === 1 ? "hour" : "hours";
      return `${hours} ${label} ago`;
    }
    if (diffMs < week) {
      const days = Math.floor(diffMs / day);
      const label = days === 1 ? "day" : "days";
      return `${days} ${label} ago`;
    }
    return this.formatTimestamp(timestamp);
  }

  async buildPreviewMap(files, boardConfig) {
    const map = new Map();
    const boardPath = boardConfig.boardFile?.path;
    const entries = files.filter((file) => this.isFileInFolder(file, boardConfig.notesFolder));
    const limit = 120;
    for (const file of entries) {
      if (boardPath && file.path === boardPath) continue;
      try {
        const cache = this.app.metadataCache.getFileCache(file);
        const firstHeading = cache?.headings?.[0]?.heading;
        const body = await this.app.vault.cachedRead(file);
        let text = body;
        if (text.startsWith("---")) {
          const endIndex = text.indexOf("\n---", 3);
          if (endIndex !== -1) {
            text = text.slice(endIndex + 4);
          }
        }
        text = text.replace(/```\s*[\s\S]*?```/g, "");
        text = text.replace(/^\s*#+\s.*$/gm, "");
        text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
        text = text.replace(/!\[.*?\]\(.*?\)/g, "");
        text = text.replace(/\[(.*?)\]\(.*?\)/g, "$1");
        text = text.replace(/`([^`]+)`/g, "$1");
        text = text.replace(/\s+/g, " ").trim();
        if (firstHeading) {
          text = text.replace(firstHeading, "").trim();
        }
        if (text.length > limit) {
          text = text.slice(0, limit).trimEnd() + "...";
        }
        map.set(file.path, text);
      } catch {
        map.set(file.path, "");
      }
    }
    return map;
  }

  getType(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const type = cache?.frontmatter?.[TYPE_FIELD];
    return typeof type === "string" ? type : null;
  }

  getPriority(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const priority = cache?.frontmatter?.[PRIORITY_FIELD];
    return typeof priority === "string" ? priority : "medium";
  }

  async collectNotesByLane(boardConfig) {
    const lanes = boardConfig.lanes;
    const defaultLane = boardConfig.defaultLane || lanes[0];
    const notesByLane = new Map();
    lanes.forEach((lane) => notesByLane.set(lane, []));
    const typeMap = new Map(
      boardConfig.cardTypes.map((type) => [type.name.toLowerCase(), type])
    );
    const priorityMap = new Map(
      PRIORITY_OPTIONS.map((option) => [option.id, option])
    );

    const files = this.app.vault.getMarkdownFiles();
    const previewMap = await this.buildPreviewMap(files, boardConfig);
    files.forEach((file) => {
      if (!this.isFileInFolder(file, boardConfig.notesFolder)) return;

      const status = this.getStatus(file);
      const movedAt = this.getMovedAt(file);
      const type = this.getType(file);
      const priority = this.getPriority(file);
      const priorityOption = priorityMap.get(priority) || priorityMap.get("medium");
      const mappedType = type ? typeMap.get(type.toLowerCase()) : null;
      const typeLabel = mappedType?.name || (type ? type : "");
      const typeColor = mappedType?.color || "";
      const targetLane = lanes.includes(status) ? status : defaultLane;
      if (this.shouldHideDone(boardConfig, targetLane, movedAt)) {
        return;
      }
      const movedAtLabel = movedAt ? this.formatMovedAtLabel(movedAt) : "";
      const movedAtTitle = movedAt ? this.formatTimestamp(movedAt) : "";
      if (!notesByLane.has(targetLane)) {
        notesByLane.set(targetLane, []);
      }
      notesByLane.get(targetLane).push({
        file,
        typeLabel,
        typeColor,
        isDone: boardConfig.doneLane && targetLane === boardConfig.doneLane,
        preview: previewMap.get(file.path) || "",
        laneLabel: targetLane,
        movedAtLabel,
        movedAtTitle,
        priority: priorityOption
      });
    });

    notesByLane.forEach((list) => {
      list.sort((a, b) => a.file.basename.localeCompare(b.file.basename));
    });

    return notesByLane;
  }

  async handleDrop(event, lane, boardConfig) {
    let file = await this.resolveDroppedFile(event);
    if (!file) {
      if (this.debugDrops) {
        this.logDropDebug(event, lane);
      }
      new Notice("No note detected in drop.");
      return;
    }
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Only markdown notes can be added to the board.");
      return;
    }

    if (!this.isFileInFolder(file, boardConfig.notesFolder)) {
      await this.moveFileToFolder(file, boardConfig.notesFolder);
    }

    await this.setStatus(file, lane);
    this.refreshViews();
  }

  async resolveDroppedFile(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return null;

    const tryResolveFromData = (data, label) => {
      if (!data) return null;
      const text = data.trim();
      if (!text) return null;

      if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.path) {
            const file = this.getFileFromPath(parsed.path);
            if (file) return file;
          }
          if (Array.isArray(parsed?.paths) && parsed.paths.length > 0) {
            const file = this.getFileFromPath(parsed.paths[0]);
            if (file) return file;
          }
          if (Array.isArray(parsed?.files) && parsed.files.length > 0) {
            const entry = parsed.files[0];
            const path = typeof entry === "string" ? entry : entry?.path;
            if (path) {
              const file = this.getFileFromPath(path);
              if (file) return file;
            }
          }
          if (parsed?.file) {
            const file = this.getFileFromPath(parsed.file);
            if (file) return file;
          }
        } catch {
          // ignore
        }
      }

      const firstLine = text.split(/\r?\n/)[0].trim();
      const fromText = this.getFileFromDragText(firstLine);
      if (fromText) return fromText;
      return this.getFileFromPath(firstLine);
    };

    const obsidianData = dataTransfer.getData("application/x-obsidian");
    if (obsidianData) {
      try {
        const parsed = JSON.parse(obsidianData);
        if (parsed?.path) {
          const file = this.getFileFromPath(parsed.path);
          if (file) return file;
        }
        if (Array.isArray(parsed?.paths) && parsed.paths.length > 0) {
          const file = this.getFileFromPath(parsed.paths[0]);
          if (file) return file;
        }
        if (Array.isArray(parsed?.files) && parsed.files.length > 0) {
          const entry = parsed.files[0];
          const path = typeof entry === "string" ? entry : entry?.path;
          if (path) {
            const file = this.getFileFromPath(path);
            if (file) return file;
          }
        }
        if (parsed?.file) {
          const file = this.getFileFromPath(parsed.file);
          if (file) return file;
        }
      } catch {
        // ignore
      }
    }

    if (dataTransfer.types && dataTransfer.types.length > 0) {
      for (const type of Array.from(dataTransfer.types)) {
        const data = dataTransfer.getData(type);
        const resolved = tryResolveFromData(data, type);
        if (resolved) return resolved;
      }
    }

    const directPath =
      dataTransfer.getData("application/kanbanify-path") ||
      dataTransfer.getData("application/obsidian-path") ||
      dataTransfer.getData("application/obsidian-file") ||
      dataTransfer.getData("text/x-obsidian-path") ||
      dataTransfer.getData("text/x-obsidian-file") ||
      dataTransfer.getData("text/plain") ||
      dataTransfer.getData("text/uri-list");

    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const path = dataTransfer.files[0].path;
      const file = this.getFileFromPath(path);
      if (file) return file;
    }

    if (!directPath) return null;

    const resolved = tryResolveFromData(directPath, "directPath");
    if (resolved) return resolved;

    if (dataTransfer.items && dataTransfer.items.length > 0) {
      for (const item of Array.from(dataTransfer.items)) {
        if (item.kind === "file") {
          const fileItem = item.getAsFile?.();
          const filePath = fileItem?.path;
          const file = this.getFileFromPath(filePath);
          if (file) return file;
        }
        if (item.kind === "string" && item.getAsString) {
          const data = await new Promise((resolve) => item.getAsString(resolve));
          const fromItem = tryResolveFromData(data, "item-string");
          if (fromItem) return fromItem;
        }
      }
    }

    if (this.lastDragPath && Date.now() - this.lastDragAt < 10000) {
      const fallback = this.getFileFromPath(this.lastDragPath);
      if (fallback) return fallback;
    }

    return null;
  }

  logDropDebug(event, lane) {
    try {
      const dataTransfer = event.dataTransfer;
      const types = dataTransfer?.types ? Array.from(dataTransfer.types) : [];
      console.log("[kanbanify] drop debug", {
        lane,
        types,
        files: dataTransfer?.files?.length || 0,
        items: dataTransfer?.items?.length || 0,
        dropEffect: dataTransfer?.dropEffect,
        effectAllowed: dataTransfer?.effectAllowed
      });
      types.forEach((type) => {
        try {
          const value = dataTransfer.getData(type);
          console.log(`[kanbanify] type ${type}`, value);
        } catch (error) {
          console.log(`[kanbanify] type ${type} error`, error);
        }
      });
    } catch (error) {
      console.log("[kanbanify] drop debug error", error);
    }
  }

  getFileFromDragText(text) {
    if (!text) return null;

    const linkMatch = text.match(/^\[\[(.+?)\]\]$/);
    let link = linkMatch ? linkMatch[1] : text;
    if (link.includes("|")) {
      link = link.split("|")[0];
    }
    if (link.includes("#")) {
      link = link.split("#")[0];
    }

    const obsidianOpenMatch = link.match(/^obsidian:\/\/open\?path=(.+)$/);
    if (obsidianOpenMatch) {
      const decoded = decodeURIComponent(obsidianOpenMatch[1]);
      const file = this.getFileFromPath(decoded);
      if (file) return file;
    }

    const appMatch = link.match(/^app:\/\/obsidian\.md\/(.+)$/);
    if (appMatch) {
      const decoded = decodeURIComponent(appMatch[1]);
      const vaultName = this.app.vault.getName();
      const withoutVault = decoded.startsWith(vaultName + "/")
        ? decoded.slice(vaultName.length + 1)
        : decoded;
      const file = this.getFileFromPath(withoutVault);
      if (file) return file;
    }

    const linkTarget = this.app.metadataCache.getFirstLinkpathDest(link, "");
    if (linkTarget instanceof TFile) return linkTarget;

    if (link.endsWith(".md")) {
      const withoutExt = link.replace(/\.md$/i, "");
      const byName = this.app.metadataCache.getFirstLinkpathDest(withoutExt, "");
      if (byName instanceof TFile) return byName;
    }

    const byName = this.app.metadataCache.getFirstLinkpathDest(link, "");
    if (byName instanceof TFile) return byName;

    return null;
  }

  getFileFromPath(path) {
    if (!path) return null;

    const normalized = this.normalizeVaultPath(path);
    const direct = this.app.vault.getAbstractFileByPath(normalized);
    if (direct instanceof TFile) return direct;

    const basePath = this.getVaultBasePath();
    if (basePath && normalized.startsWith(basePath)) {
      const relative = normalized.slice(basePath.length + 1);
      const relativeNormalized = this.normalizeVaultPath(relative);
      const fileFromBase = this.app.vault.getAbstractFileByPath(relativeNormalized);
      if (fileFromBase instanceof TFile) return fileFromBase;
    }

    if (normalized.startsWith("file://")) {
      const filePath = normalized.replace("file://", "").replace(/^\/+/, "");
      const fileFromUri = this.getFileFromPath(filePath);
      if (fileFromUri) return fileFromUri;
    }

    return null;
  }

  normalizeVaultPath(path) {
    return path.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (adapter && typeof adapter.getBasePath === "function") {
      return this.normalizeVaultPath(adapter.getBasePath());
    }
    return null;
  }

  async setStatus(file, lane) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[STATUS_FIELD] = lane;
      frontmatter[MOVED_AT_FIELD] = Date.now();
    });
  }

  async setType(file, type) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (!type) {
        delete frontmatter[TYPE_FIELD];
      } else {
        frontmatter[TYPE_FIELD] = type;
      }
    });
  }  
  
  async setPriority(file, priority) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    const priorityId = PRIORITY_OPTIONS.some((option) => option.id === priority)
      ? priority
      : "medium";
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[PRIORITY_FIELD] = priorityId;
    });
  }

  shouldHideDone(boardConfig, lane, movedAt) {
    if (!boardConfig.doneLane) return false;
    if (lane !== boardConfig.doneLane) return false;
    const rule = boardConfig.hideDoneAfter || "Never";
    if (rule === "Never") return false;
    if (rule === "Immediately") return true;
    if (!movedAt) return false;
    const ageMs = Date.now() - movedAt;
    const thresholds = {
      "10 minutes": 10 * 60 * 1000,
      "One Day": 24 * 60 * 60 * 1000,
      "One Week": 7 * 24 * 60 * 60 * 1000,
      "Two Weeks": 14 * 24 * 60 * 60 * 1000
    };
    const threshold = thresholds[rule];
    if (!threshold) return false;
    return ageMs > threshold;
  }

  async createNoteInLane(lane, boardConfig) {
    if (!boardConfig) {
      new Notice("No board configuration available.");
      return;
    }
    const folder = boardConfig.notesFolder || this.settings.notesFolder || "Kanban";
    new Notice(`Add notes from the + button on the lane.`);
  }

  async moveFileToFolder(file, folder) {
    if (!folder) return;
    await this.ensureFolder(folder);
    const targetPath = await this.getUniqueFilepath(`${folder}/${file.name}`);
    if (targetPath !== file.path) {
      await this.app.fileManager.renameFile(file, targetPath);
    }
  }

  async ensureFolder(folder) {
    const normalized = this.normalizeFolder(folder);
    if (!normalized) return;
    const exists = this.app.vault.getAbstractFileByPath(normalized);
    if (!exists) {
      await this.app.vault.createFolder(normalized);
    }
  }

  async getUniqueFilepath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const match = path.match(/^(.*?)(\.\w+)$/);
    const base = match ? match[1] : path;
    const ext = match ? match[2] : "";
    let counter = 1;
    let candidate = `${base} ${counter}${ext}`;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      counter += 1;
      candidate = `${base} ${counter}${ext}`;
    }
    return candidate;
  }

  async openFile(file) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }

  openInlineCreateMenu(anchorEl, lane, boardConfig) {
    if (!anchorEl || !boardConfig) return;
    this.closeInlinePopover();

    const menu = document.createElement("div");
    menu.className = "kanbanify-inline-create";
    const rect = anchorEl.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;

    const title = document.createElement("div");
    title.className = "kanbanify-inline-title";
    title.textContent = "New note";
    menu.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Note title";
    input.className = "kanbanify-input";
    menu.appendChild(input);

    const typeLabel = document.createElement("div");
    typeLabel.className = "kanbanify-inline-label";
    typeLabel.textContent = "Note type";
    menu.appendChild(typeLabel);

    const select = document.createElement("select");
    select.className = "kanbanify-select";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "No type";
    select.appendChild(noneOption);
    (boardConfig.cardTypes || []).forEach((type) => {
      const option = document.createElement("option");
      option.value = type.name;
      option.textContent = type.name;
      select.appendChild(option);
    });
    if (this.settings.lastSelectedType) {
      select.value = this.settings.lastSelectedType;
    }
    menu.appendChild(select);

    const actions = document.createElement("div");
    actions.className = "kanbanify-inline-actions";
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    const createButton = document.createElement("button");
    createButton.textContent = "Create";
    actions.appendChild(cancelButton);
    actions.appendChild(createButton);
    menu.appendChild(actions);

    const close = () => this.closeInlinePopover();
    cancelButton.addEventListener("click", close);

    const submit = async () => {
      const name = input.value.trim();
      if (!name) {
        new Notice("Please enter a note title.");
        return;
      }
      const type = select.value.trim();
      this.settings.lastSelectedType = type || "";
      await this.saveSettings();
      await this.createNoteInLaneFromData(lane, boardConfig, name, type);
      close();
    };

    createButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const onDocumentClick = (event) => {
      if (!menu.contains(event.target)) {
        close();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);

    this.inlinePopover = {
      el: menu,
      cleanup: () => {
        document.removeEventListener("mousedown", onDocumentClick);
        document.removeEventListener("keydown", onKeyDown);
      }
    };

    document.body.appendChild(menu);
    window.setTimeout(() => input.focus(), 0);
  }

  openInlineLaneRenameMenu(anchorEl, boardFile, laneName) {
    if (!anchorEl || !boardFile) return;
    this.closeInlinePopover();

    const menu = document.createElement("div");
    menu.className = "kanbanify-inline-create";
    const rect = anchorEl.getBoundingClientRect();
    const width = 220;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;

    const title = document.createElement("div");
    title.className = "kanbanify-inline-title";
    title.textContent = "Rename lane";
    menu.appendChild(title);

    const input = document.createElement("input");
    input.type = "text";
    input.className = "kanbanify-input";
    input.value = laneName;
    menu.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "kanbanify-inline-actions";
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    menu.appendChild(actions);

    const close = () => this.closeInlinePopover();
    cancelButton.addEventListener("click", close);

    const submit = async () => {
      const value = input.value.trim();
      if (!value) {
        new Notice("Lane name cannot be empty.");
        return;
      }
      await this.renameLane(boardFile, laneName, value);
      close();
    };

    saveButton.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const onDocumentClick = (event) => {
      if (!menu.contains(event.target)) {
        close();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);

    this.inlinePopover = {
      el: menu,
      cleanup: () => {
        document.removeEventListener("mousedown", onDocumentClick);
        document.removeEventListener("keydown", onKeyDown);
      }
    };

    document.body.appendChild(menu);
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  openInlinePriorityMenu(anchorEl, file) {
    if (!anchorEl || !file) return;
    this.closeInlinePopover();

    const menu = document.createElement("div");
    menu.className = "kanbanify-inline-create";
    const rect = anchorEl.getBoundingClientRect();
    const width = 200;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;

    const title = document.createElement("div");
    title.className = "kanbanify-inline-title";
    title.textContent = "Priority";
    menu.appendChild(title);

    const select = document.createElement("select");
    select.className = "kanbanify-select";
    PRIORITY_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.id;
      opt.textContent = option.label;
      select.appendChild(opt);
    });
    select.value = this.getPriority(file);
    menu.appendChild(select);

    const actions = document.createElement("div");
    actions.className = "kanbanify-inline-actions";
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    menu.appendChild(actions);

    const close = () => this.closeInlinePopover();
    cancelButton.addEventListener("click", close);

    const submit = async () => {
      await this.setPriority(file, select.value.trim());
      this.refreshViews();
      close();
    };

    saveButton.addEventListener("click", submit);
    select.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const onDocumentClick = (event) => {
      if (!menu.contains(event.target)) {
        close();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);

    this.inlinePopover = {
      el: menu,
      cleanup: () => {
        document.removeEventListener("mousedown", onDocumentClick);
        document.removeEventListener("keydown", onKeyDown);
      }
    };

    document.body.appendChild(menu);
    window.setTimeout(() => select.focus(), 0);
  }

  openInlineCardSettingsMenu(anchorEl, file, boardConfig) {
    if (!anchorEl || !file || !boardConfig) return;
    this.closeInlinePopover();

    const menu = document.createElement("div");
    menu.className = "kanbanify-inline-create";
    const rect = anchorEl.getBoundingClientRect();
    const width = 240;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;

    const title = document.createElement("div");
    title.className = "kanbanify-inline-title";
    title.textContent = "Card settings";
    menu.appendChild(title);

    const typeLabel = document.createElement("div");
    typeLabel.className = "kanbanify-inline-label";
    typeLabel.textContent = "Type";
    menu.appendChild(typeLabel);

    const typeSelect = document.createElement("select");
    typeSelect.className = "kanbanify-select";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.textContent = "No type";
    typeSelect.appendChild(noneOption);
    (boardConfig.cardTypes || []).forEach((type) => {
      const option = document.createElement("option");
      option.value = type.name;
      option.textContent = type.name;
      typeSelect.appendChild(option);
    });
    const currentType = this.getType(file);
    if (currentType) {
      typeSelect.value = currentType;
    }
    menu.appendChild(typeSelect);

    const priorityLabel = document.createElement("div");
    priorityLabel.className = "kanbanify-inline-label";
    priorityLabel.textContent = "Priority";
    menu.appendChild(priorityLabel);

    const prioritySelect = document.createElement("select");
    prioritySelect.className = "kanbanify-select";
    PRIORITY_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.id;
      opt.textContent = option.label;
      prioritySelect.appendChild(opt);
    });
    prioritySelect.value = this.getPriority(file);
    menu.appendChild(prioritySelect);

    const actions = document.createElement("div");
    actions.className = "kanbanify-inline-actions";
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    menu.appendChild(actions);

    const close = () => this.closeInlinePopover();
    cancelButton.addEventListener("click", close);

    const submit = async () => {
      await this.setType(file, typeSelect.value.trim());
      await this.setPriority(file, prioritySelect.value.trim());
      this.refreshViews();
      close();
    };

    saveButton.addEventListener("click", submit);
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    menu.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    const onDocumentClick = (event) => {
      if (!menu.contains(event.target)) {
        close();
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        close();
      }
    };

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);

    this.inlinePopover = {
      el: menu,
      cleanup: () => {
        document.removeEventListener("mousedown", onDocumentClick);
        document.removeEventListener("keydown", onKeyDown);
      }
    };

    document.body.appendChild(menu);
    window.setTimeout(() => typeSelect.focus(), 0);
  }

  closeInlinePopover() {
    if (!this.inlinePopover) return;
    this.inlinePopover.cleanup();
    this.inlinePopover.el.remove();
    this.inlinePopover = null;
  }

  async createNoteInLaneFromData(lane, boardConfig, name, type) {
    if (!boardConfig) return;
    const folder = boardConfig.notesFolder || this.settings.notesFolder || "Kanban";
    const sanitized = name.replace(/[\\/:*?"<>|]/g, "").trim();
    if (!sanitized) {
      new Notice("Invalid note title.");
      return;
    }

    await this.ensureFolder(folder);
    const path = await this.getUniqueFilepath(`${folder}/${sanitized}.md`);
    const file = await this.app.vault.create(path, `# ${sanitized}\n`);
    await this.setStatus(file, lane);
    if (type) {
      await this.setType(file, type);
    }
    
    await this.setPriority(file, "medium");
    this.refreshViews();
  }

  async openBoardMarkdown(file) {
    const leaf = this.app.workspace.getLeaf(false);
    if (!leaf) return;
    this.suppressedBoardFiles.set(file.path, Date.now() + 1500);
    await leaf.setViewState({
      type: "markdown",
      active: true,
      state: { file: file.path }
    });
  }

  openBoardSettings(boardFile) {
    const modal = new BoardSettingsModal(this.app, this, boardFile);
    modal.open();
  }

  openLaneSettings(boardFile, laneName) {
    const modal = new LaneRenameModal(this.app, laneName);
    modal.resolve = async (value) => {
      if (!value || value === laneName) return;
      await this.renameLane(boardFile, laneName, value);
    };
    modal.open();
  }

  openCardTypeSettings(file, boardConfig) {
    const typeOptions = boardConfig.cardTypes || this.getCardTypes();
    const currentType = this.getType(file) || "";
    const modal = new CardTypeSelectModal(this.app, typeOptions, currentType);
    modal.resolve = async (value) => {
      if (value === null) return;
      await this.setType(file, value);
      this.refreshViews();
    };
    modal.open();
  }

  async deleteNote(file) {
    if (!(file instanceof TFile)) return;
    if (this.app.vault.trash) {
      await this.app.vault.trash(file, true);
    } else {
      await this.app.vault.delete(file);
    }
    this.refreshViews();
  }

  async updateBoardConfig(boardFile, updates) {
    const lanes = Array.isArray(updates.lanes) ? updates.lanes : [];
    const notesFolder = this.normalizeFolder(updates.notesFolder || "");
    const defaultLane = updates.defaultLane || (lanes[0] || "");
    const cardTypes = Array.isArray(updates.cardTypes)
      ? updates.cardTypes.map((type) => ({
        name: String(type.name || "").trim(),
        color: typeof type.color === "string" ? type.color : "#0ea5e9"
      })).filter((type) => type.name.length > 0)
      : [];
    const doneLane = typeof updates.doneLane === "string" ? updates.doneLane : "";
    const hideDoneAfter = typeof updates.hideDoneAfter === "string"
      ? updates.hideDoneAfter
      : "Never";

    await this.app.fileManager.processFrontMatter(boardFile, (frontmatter) => {
      frontmatter[BOARD_FIELD] = true;
      frontmatter[LANES_FIELD] = lanes;
      frontmatter[FOLDER_FIELD] = notesFolder;
      frontmatter[DEFAULT_LANE_FIELD] = defaultLane;
      frontmatter[CARD_TYPES_FIELD] = cardTypes;
      frontmatter[DONE_LANE_FIELD] = doneLane;
      frontmatter[HIDE_DONE_AFTER_FIELD] = hideDoneAfter;
    });
  }

  async renameLane(boardFile, fromLane, toLane) {
    const boardConfig = this.getBoardConfig(boardFile);
    if (!boardConfig) return;
    const trimmed = toLane.trim();
    if (!trimmed) {
      new Notice("Lane name cannot be empty.");
      return;
    }
    const lanes = boardConfig.lanes.slice();
    if (lanes.includes(trimmed)) {
      new Notice("Lane name already exists.");
      return;
    }
    const index = lanes.indexOf(fromLane);
    if (index === -1) return;
    lanes[index] = trimmed;
    const defaultLane = boardConfig.defaultLane === fromLane
      ? trimmed
      : boardConfig.defaultLane;

    await this.updateBoardConfig(boardFile, {
      lanes,
      notesFolder: boardConfig.notesFolderInput,
      defaultLane,
      cardTypes: boardConfig.cardTypes
    });

    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      return this.isFileInFolder(file, boardConfig.notesFolder);
    });
    for (const file of files) {
      if (this.getStatus(file) === fromLane) {
        await this.setStatus(file, trimmed);
      }
    }
    this.refreshViews();
  }

  async createBoard() {
    const title = await this.promptForValue("Board note title", "Kanban Board", "Kanban Board");
    if (!title) return;

    const sanitized = title.replace(/[\\/:*?"<>|]/g, "").trim();
    if (!sanitized) {
      new Notice("Invalid board title.");
      return;
    }

    const notesFolder =
      (await this.promptForValue(
        "Folder for tracked notes",
        "Kanban",
        this.settings.notesFolder || "Kanban"
      )) || this.settings.notesFolder || "Kanban";

    const lanes = this.getLaneList();
    const defaultLane = lanes.includes(this.settings.defaultLane)
      ? this.settings.defaultLane
      : lanes[0];

    const defaultDoneLane = lanes.includes("Done") ? "Done" : (lanes[lanes.length - 1] || defaultLane);
    const frontmatterLines = [
      "---",
      "kanbanBoard: true",
      `kanbanFolder: "${notesFolder}"`,
      "kanbanLanes:",
      ...lanes.map((lane) => `  - "${lane}"`),
      `kanbanDefaultLane: "${defaultLane}"`,
      `kanbanDoneLane: "${defaultDoneLane}"`,
      "kanbanHideDoneAfter: \"Never\"",
      "kanbanTypes:",
      ...this.getCardTypes().map((type) => `  - name: "${type.name}"\n    color: "${type.color}"`),
      "---",
      "",
      `# ${sanitized}`,
      ""
    ];

    const path = await this.getUniqueFilepath(`${sanitized}.md`);
    const boardFile = await this.app.vault.create(path, frontmatterLines.join("\n"));
    await this.openBoard(boardFile);
    new Notice("Kanban board created.");
  }

  async createBoardInFolder(folderPath) {
    const title = await this.promptForValue("Board note title", "Kanban Board", "Kanban Board");
    if (!title) return;

    const sanitized = title.replace(/[\\/:*?"<>|]/g, "").trim();
    if (!sanitized) {
      new Notice("Invalid board title.");
      return;
    }

    const notesFolder =
      (await this.promptForValue(
        "Folder for tracked notes",
        "Kanban",
        this.settings.notesFolder || "Kanban"
      )) || this.settings.notesFolder || "Kanban";

    const lanes = this.getLaneList();
    const defaultLane = lanes.includes(this.settings.defaultLane)
      ? this.settings.defaultLane
      : lanes[0];

    const frontmatterLines = [
      "---",
      "kanbanBoard: true",
      `kanbanFolder: "${notesFolder}"`,
      "kanbanLanes:",
      ...lanes.map((lane) => `  - "${lane}"`),
      `kanbanDefaultLane: "${defaultLane}"`,
      "---",
      "",
      `# ${sanitized}`,
      ""
    ];

    if (folderPath) {
      await this.ensureFolder(folderPath);
    }
    const prefix = folderPath ? `${folderPath}/` : "";
    const path = await this.getUniqueFilepath(`${prefix}${sanitized}.md`);
    const boardFile = await this.app.vault.create(path, frontmatterLines.join("\n"));
    await this.openBoard(boardFile);
    new Notice("Kanban board created.");
  }

  async promptForValue(title, placeholder, initialValue) {
    return new Promise((resolve) => {
      const modal = new TextPromptModal(
        this.app,
        title,
        placeholder,
        initialValue
      );
      modal.resolve = resolve;
      modal.open();
    });
  }

  async promptForNoteType(typeOptions) {
    return new Promise((resolve) => {
      const modal = new TypePromptModal(
        this.app,
        "New note",
        typeOptions,
        this.settings.lastSelectedType
      );
      modal.resolve = resolve;
      modal.open();
    });
  }
};

