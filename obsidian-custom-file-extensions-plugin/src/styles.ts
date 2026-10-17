export const PLUGIN_STYLES = `
/* ==========================================================================
   Custom File Extensions Plugin - Code Block View & Settings Styles
   ========================================================================== */

/* Main Container for Code View */
.custom-code-file-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--background-primary);
}

.custom-code-file-view .code-view-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Header bar displaying file name, language tag, metadata, and copy button */
.custom-code-file-view .code-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--background-secondary);
  border-bottom: 1px solid var(--divider-color);
  font-size: var(--font-ui-smaller);
  user-select: none;
  flex-shrink: 0;
}

.custom-code-file-view .code-view-info {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-code-file-view .code-view-filename {
  font-weight: var(--font-semibold);
  color: var(--text-normal);
}

.custom-code-file-view .code-view-lang-tag {
  background-color: var(--background-modifier-border);
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: var(--radius-s);
  font-size: 11px;
  font-family: var(--font-monospace);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.custom-code-file-view .code-view-meta {
  color: var(--text-faint);
  font-size: 12px;
}

.custom-code-file-view .code-view-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-code-file-view .code-view-copy-btn {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-s);
  cursor: pointer;
  background-color: var(--interactive-normal);
  color: var(--text-normal);
  border: 1px solid var(--interactive-border);
  transition: all 0.15s ease-in-out;
}

.custom-code-file-view .code-view-copy-btn:hover {
  background-color: var(--interactive-hover);
}

.custom-code-file-view .code-view-copy-btn.copied {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}

/* Code Container */
.custom-code-file-view .code-view-container {
  flex: 1 1 auto;
  overflow: auto;
  padding: 16px;
  background-color: var(--background-primary);
}

.custom-code-file-view .code-view-container pre {
  margin: 0;
  padding: 16px;
  background-color: var(--code-background);
  border-radius: var(--radius-m);
  border: 1px solid var(--code-border-color, var(--divider-color));
  font-family: var(--font-monospace);
  font-size: var(--code-size);
  line-height: var(--line-height-tight, 1.5);
  overflow-x: auto;
  white-space: pre;
  word-break: normal;
  tab-size: 4;
}

.custom-code-file-view .code-view-container pre code {
  font-family: inherit;
  font-size: inherit;
  background: transparent;
  padding: 0;
  white-space: inherit;
}

/* Error message styling */
.custom-code-file-view .code-view-error {
  padding: 24px;
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
