/* START> Tharyn | ZedUIMax Launch Classification
    2026-09-12
    What: Open and inspect the live new-session classification dialog without launching a CLI.
    Why: Verify the production renderer's required fields, dimmed host, geometry, and validation.
    Expected: Every returned check is true and the filled dialog remains open for visual review.
*/
(async () => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = predicate();
      if (result) return result;
      await pause(50);
    }
    throw new Error('Timed out opening launch classification dialog');
  };

  document.querySelector('button[title="Launch Assistant"]')?.click();
  const claude = await waitFor(() => Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent.trim() === 'Claude2'));
  claude.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  const newButton = await waitFor(() => Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent.trim() === 'New'));
  newButton.click();
  await waitFor(() => document.querySelector('.launch-classification-dialog'));

  const summary = document.querySelector('input[placeholder="What is this session for?"]');
  const category = document.querySelector('input[placeholder="Select or enter a category"]');
  const submit = document.querySelector('.launch-classification-submit');
  const disabledBefore = submit?.disabled === true;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(summary, 'Implement automatic launch classification');
  summary.dispatchEvent(new Event('input', { bubbles: true }));
  setter.call(category, 'App Development');
  category.dispatchEvent(new Event('input', { bubbles: true }));
  await pause(100);

  const dialog = document.querySelector('.launch-classification-dialog');
  const backdrop = document.querySelector('.launch-classification-backdrop');
  const dialogRect = dialog.getBoundingClientRect();
  const backdropStyle = getComputedStyle(backdrop);
  return {
    checks: {
      dialogOpen: !!dialog,
      correctLauncher: dialog.querySelector('h2')?.textContent.includes('Claude2'),
      summaryPresent: !!summary,
      categoryPresent: !!category,
      existingCategoryListAttached: category?.getAttribute('list') === 'launch-classification-types',
      requiredUntilBothEntered: disabledBefore,
      enabledAfterBothEntered: submit?.disabled === false,
      cancelPresent: Array.from(dialog.querySelectorAll('button')).some(button => button.textContent.trim() === 'Cancel'),
      hostDimmed: backdropStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
      dialogFitsViewport: dialogRect.left >= 0 && dialogRect.right <= innerWidth
        && dialogRect.top >= 32 && dialogRect.bottom <= innerHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    },
    geometry: {
      width: Math.round(dialogRect.width),
      height: Math.round(dialogRect.height),
      left: Math.round(dialogRect.left),
      top: Math.round(dialogRect.top),
    },
    values: {
      summary: summary.value,
      category: category.value,
      submit: submit.textContent.trim(),
    },
  };
})()
// <END Tharyn | ZedUIMax Launch Classification
