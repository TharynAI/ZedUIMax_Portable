/* START> Tharyn | ZedMax
    2026-09-12
    What: Read-only CDP validation for the live ZedMax shell.
    Why: Confirm the production window loaded the intended structure, tokens, dimensions, and identity presentation.
    Expected: The returned checks are all true without changing live session data.
*/
(() => {
  const rootStyle = getComputedStyle(document.documentElement);
  const titlebar = document.querySelector('.titlebar');
  const rail = document.querySelector('.zed-nav-rail');
  const workbench = document.querySelector('.zed-session-workbench');
  const buttonLabels = Array.from(document.querySelectorAll('button'))
    .map(button => button.textContent.trim());
  const visibleHandles = Array.from(document.querySelectorAll(
    '.zed-preview-handle, .zed-status-handle, .browse-tree-session [title^="Handle:"]',
  )).map(node => node.textContent.trim());
  const state = window.__ZEDUI_STORE__.getState();

  return {
    checks: {
      shellLoaded: !!document.querySelector('.zed-app-shell'),
      singleWorkspace: document.querySelectorAll('.zed-session-workbench').length === 1,
      deprecatedTabsAbsent: !buttonLabels.includes('View') && !buttonLabels.includes('ProEng'),
      railWidth: Math.round(rail?.getBoundingClientRect().width || 0) === 68,
      titlebarHeight: Math.round(titlebar?.getBoundingClientRect().height || 0) === 38,
      workbenchVisible: (workbench?.getBoundingClientRect().height || 0) > 200,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      zedCacheBackground: rootStyle.getPropertyValue('--zed-bg').trim() === '#10110f',
      handlesDoNotContainAt: visibleHandles.every(handle => !handle.includes('@')),
    },
    state: {
      sessions: state.sessions.length,
      projects: state.projects.length,
      selectedSessionId: state.selectedSessionId,
      isLoading: state.isLoading,
      error: state.error,
    },
    visibleHandles,
    viewport: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    },
  };
})()
// <END Tharyn | ZedMax
