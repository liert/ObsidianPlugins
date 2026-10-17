export const PLUGIN_STYLES = `
/* ==========================================================================
   Custom File Extensions Plugin - Code Editor & Settings Styles
   ========================================================================== */

/* Main Container for Code Editor View */
.custom-code-editor-view {
  height: 100% !important;
  width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.custom-code-editor-view .cm-editor {
  height: 100% !important;
  width: 100% !important;
  flex: 1 1 auto;
}

/* ==========================================================================
   Settings Tab Styling
   ========================================================================== */

.cfe-code-section-title {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--divider-color);
}

.cfe-add-container {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cfe-ext-input {
  width: 160px;
}

.cfe-lang-input {
  width: 160px;
}

.cfe-add-btn {
  white-space: nowrap;
}

.cfe-ext-list-header {
  margin-top: 16px;
  margin-bottom: 8px;
}

.cfe-ext-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.cfe-empty-notice {
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--font-ui-smaller);
  margin: 12px 0;
}

.cfe-error-msg {
  color: var(--text-error);
  font-size: var(--font-ui-smaller);
  margin: 6px 0 12px 0;
  padding: 6px 10px;
  background-color: var(--background-modifier-error);
  border-radius: var(--radius-s);
}
`;
