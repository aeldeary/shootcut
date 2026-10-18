// Shootcut's sample for the editing program: four short aerial clips on a timeline, built through the program's own
// control API the first time the program opens with an empty project (the page is opened with ?empty by Shootcut).
(function () {
  var KEY = 'shootcut-film-sample-v1';
  var NAMES = ['Canyon_Bridge', 'River_Rocks', 'Vineyard_Road', 'Sandstone_Cliffs'];
  try {
    if (!new URLSearchParams(location.search).has('empty')) return;
    if (localStorage.getItem(KEY)) return;
  } catch (e) {
    return;
  }
  var tries = 0;
  var timer = setInterval(function () {
    if (++tries > 600) return clearInterval(timer);
    if (!window.filmcraft) return;
    clearInterval(timer);
    setTimeout(seed, 2500);
  }, 150);

  async function seed() {
    try {
      var fc = window.filmcraft;
      var info = await fc.execute('project.inspect', {});
      // a session the program restored (or anything already imported) is left alone
      if (info && info.root && info.root.children && info.root.children.length) return;
      var ids = [];
      for (var i = 0; i < NAMES.length; i++) {
        var r = await fc.importUrl('sample/' + NAMES[i] + '.mp4');
        if (r && r.items && r.items.length) ids.push(r.items[0]);
      }
      if (!ids.length) return;
      await fc.execute('file.newSequence', { name: 'Shootcut Edit' });
      var p = await fc.execute('timeline.place', { items: ids, time: 0 });
      await fc.execute('clip.fillFrame', { clips: p.clips });
      var c = p.clips;
      // Transitions and effects, so the sample shows them too.
      var step = async function (cmd, args) { try { await fc.execute(cmd, args); } catch (e) { console.warn('Shootcut sample step skipped:', cmd, e); } };
      await step('sequence.applyVideoTransition', { clip: c[0], effect: 'dip_to_black', frames: 18, edge: 'in' });
      if (c[1]) await step('sequence.applyVideoTransition', { clip: c[0], effect: 'cross_dissolve', frames: 24, edge: 'out' });
      if (c[3]) await step('sequence.applyVideoTransition', { clip: c[2], effect: 'push', frames: 24, edge: 'out' });
      if (c[3]) await step('sequence.applyVideoTransition', { clip: c[3], effect: 'dip_to_black', frames: 18, edge: 'out' });
      await step('effects.apply', { clips: [c[0]], effect: 'lumetri' });
      await step('effects.setParam', { clip: c[0], effect: 'lumetri', param: 'contrast', value: 15 });
      if (c[1]) {
        await step('effects.apply', { clips: [c[1]], effect: 'brightness_contrast' });
        await step('effects.setParam', { clip: c[1], effect: 'brightness_contrast', param: 'contrast', value: 22 });
        await step('effects.setParam', { clip: c[1], effect: 'brightness_contrast', param: 'brightness', value: 6 });
      }
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
    } catch (e) {
      console.warn('Shootcut sample could not be built:', e);
    }
  }
})();
