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
const BOARD_FIELD = "kanbanBoard";
const LANES_FIELD = "kanbanLanes";
const FOLDER_FIELD = "kanbanFolder";
const DEFAULT_LANE_FIELD = "kanbanDefaultLane";
const CARD_TYPES_FIELD = "kanbanTypes";

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

class KanbanView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.boardEl = null;
    this.boardPath = null;
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

    const boardFile = this.getBoardFile();
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
    const lanesEl = this.boardEl.createDiv("kanbanify-lanes");

    lanes.forEach((lane) => {
      const laneEl = lanesEl.createDiv("kanbanify-lane");
      const headerEl = laneEl.createDiv("kanbanify-lane-header");
      headerEl.createDiv({
        cls: "kanbanify-lane-title",
        text: lane
      });
      const addButton = headerEl.createEl("button", {
        cls: "kanbanify-add",
        attr: { "aria-label": `Add note to ${lane}`, type: "button" }
      });
      setIcon(addButton, "plus");
      addButton.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await this.plugin.createNoteInLane(lane, boardConfig);
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

      const notes = notesByLane.get(lane) || [];
      notes.forEach((note) => {
        const cardEl = contentEl.createDiv("kanbanify-card");
        cardEl.setAttr("draggable", "true");
        cardEl.setAttr("data-path", note.file.path);
        if (note.typeColor) {
          cardEl.style.borderLeft = `4px solid ${note.typeColor}`;
        }
        cardEl.createDiv({
          cls: "kanbanify-card-title",
          text: note.file.basename
        });
        if (note.typeLabel) {
          const typeEl = cardEl.createDiv("kanbanify-card-type");
          typeEl.setText(note.typeLabel);
          if (note.typeColor) {
            typeEl.style.borderColor = note.typeColor;
            typeEl.style.color = note.typeColor;
          }
        }
        cardEl.addEventListener("click", () => {
          this.plugin.openFile(note.file);
        });
        cardEl.addEventListener("dragstart", (event) => {
          event.dataTransfer?.setData("application/kanbanify-path", note.file.path);
          event.dataTransfer?.setData("text/plain", note.file.path);
          event.dataTransfer?.setData("text/uri-list", note.file.path);
          event.dataTransfer?.setDragImage(cardEl, 10, 10);
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
    folderInput.value = boardConfig.notesFolder;
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
        cardTypes: types
      });
      this.plugin.refreshViews();
      this.close();
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
      if (this.isFileInFolder(file, boardConfig.notesFolderPath)) {
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
    const notesFolder = this.normalizeRelativeFolder(
      typeof frontmatter[FOLDER_FIELD] === "string"
        ? frontmatter[FOLDER_FIELD]
        : this.settings.notesFolder
    );
    const notesFolderPath = this.resolveFolderForBoard(boardFile, notesFolder);
    const defaultLane = typeof frontmatter[DEFAULT_LANE_FIELD] === "string"
      ? frontmatter[DEFAULT_LANE_FIELD]
      : this.settings.defaultLane;
    const cardTypes = this.parseCardTypes(frontmatter[CARD_TYPES_FIELD]) || this.getCardTypes();

    const finalLanes = lanes.length > 0 ? lanes : DEFAULT_SETTINGS.lanes.slice();
    const finalDefaultLane = finalLanes.includes(defaultLane) ? defaultLane : finalLanes[0];

    return {
      title: boardFile.basename,
      boardFile,
      lanes: finalLanes,
      notesFolder,
      notesFolderPath,
      defaultLane: finalDefaultLane,
      cardTypes
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

  normalizeRelativeFolder(folder) {
    const normalized = this.normalizeFolder(folder);
    if (!normalized) return "";
    return normalized.replace(/^[/\\]+/, "");
  }

  resolveFolderForBoard(boardFile, folder) {
    const normalized = this.normalizeRelativeFolder(folder);
    if (!normalized) return "";
    const base = boardFile?.parent?.path || "";
    return base ? `${base}/${normalized}` : normalized;
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

  getType(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const type = cache?.frontmatter?.[TYPE_FIELD];
    return typeof type === "string" ? type : null;
  }

  async collectNotesByLane(boardConfig) {
    const lanes = boardConfig.lanes;
    const defaultLane = boardConfig.defaultLane || lanes[0];
    const notesByLane = new Map();
    lanes.forEach((lane) => notesByLane.set(lane, []));
    const typeMap = new Map(
      boardConfig.cardTypes.map((type) => [type.name.toLowerCase(), type])
    );

    const files = this.app.vault.getMarkdownFiles();
    files.forEach((file) => {
      if (!this.isFileInFolder(file, boardConfig.notesFolderPath)) return;

      const status = this.getStatus(file);
      const type = this.getType(file);
      const mappedType = type ? typeMap.get(type.toLowerCase()) : null;
      const typeLabel = mappedType?.name || (type ? type : "");
      const typeColor = mappedType?.color || "";
      const targetLane = lanes.includes(status) ? status : defaultLane;
      if (!notesByLane.has(targetLane)) {
        notesByLane.set(targetLane, []);
      }
      notesByLane.get(targetLane).push({
        file,
        typeLabel,
        typeColor
      });
    });

    notesByLane.forEach((list) => {
      list.sort((a, b) => a.file.basename.localeCompare(b.file.basename));
    });

    return notesByLane;
  }

  async handleDrop(event, lane, boardConfig) {
    let file = this.resolveDroppedFile(event);
    if (!file) {
      new Notice("No note detected in drop.");
      return;
    }
    if (!(file instanceof TFile) || file.extension !== "md") {
      new Notice("Only markdown notes can be added to the board.");
      return;
    }

    if (!this.isFileInFolder(file, boardConfig.notesFolderPath)) {
      await this.moveFileToFolder(file, boardConfig.notesFolderPath);
    }

    await this.setStatus(file, lane);
    this.refreshViews();
  }

  resolveDroppedFile(event) {
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) return null;

    const directPath =
      dataTransfer.getData("application/kanbanify-path") ||
      dataTransfer.getData("application/obsidian-path") ||
      dataTransfer.getData("text/plain") ||
      dataTransfer.getData("text/uri-list");

    const obsidianData = dataTransfer.getData("application/x-obsidian");
    if (obsidianData) {
      try {
        const parsed = JSON.parse(obsidianData);
        if (parsed?.path) {
          const file = this.getFileFromPath(parsed.path);
          if (file) return file;
        }
      } catch {
        // ignore
      }
    }

    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const path = dataTransfer.files[0].path;
      const file = this.getFileFromPath(path);
      if (file) return file;
    }

    if (!directPath) return null;

    const text = directPath.trim();
    const fileFromText = this.getFileFromDragText(text);
    if (fileFromText) return fileFromText;

    return this.getFileFromPath(text);
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
    });
  }

  async setType(file, type) {
    if (!(file instanceof TFile) || file.extension !== "md") {
      return;
    }
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[TYPE_FIELD] = type;
    });
  }

  async createNoteInLane(lane, boardConfig) {
    if (!boardConfig) {
      new Notice("No board configuration available.");
      return;
    }
    const folder = boardConfig.notesFolderPath
      || this.resolveFolderForBoard(
        boardConfig.boardFile,
        this.settings.notesFolder || "Kanban"
      )
      || "Kanban";
    const typeOptions = boardConfig.cardTypes || this.getCardTypes();
    const result = await this.promptForNoteType(typeOptions);
    if (!result || !result.title) return;
    const name = result.title;
    const type = result.type;
    this.settings.lastSelectedType = type || "";
    await this.saveSettings();

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
    await this.openFile(file);
    this.refreshViews();
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

  async updateBoardConfig(boardFile, updates) {
    const lanes = Array.isArray(updates.lanes) ? updates.lanes : [];
    const notesFolder = this.normalizeRelativeFolder(updates.notesFolder || "");
    const defaultLane = updates.defaultLane || (lanes[0] || "");
    const cardTypes = Array.isArray(updates.cardTypes)
      ? updates.cardTypes.map((type) => ({
        name: String(type.name || "").trim(),
        color: typeof type.color === "string" ? type.color : "#0ea5e9"
      })).filter((type) => type.name.length > 0)
      : [];

    await this.app.fileManager.processFrontMatter(boardFile, (frontmatter) => {
      frontmatter[BOARD_FIELD] = true;
      frontmatter[LANES_FIELD] = lanes;
      frontmatter[FOLDER_FIELD] = notesFolder;
      frontmatter[DEFAULT_LANE_FIELD] = defaultLane;
      frontmatter[CARD_TYPES_FIELD] = cardTypes;
    });
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

    const frontmatterLines = [
      "---",
      "kanbanBoard: true",
      `kanbanFolder: "${notesFolder}"`,
      "kanbanLanes:",
      ...lanes.map((lane) => `  - "${lane}"`),
      `kanbanDefaultLane: "${defaultLane}"`,
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

