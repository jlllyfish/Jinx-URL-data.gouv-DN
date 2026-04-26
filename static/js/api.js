// api.js — appels vers le backend Flask

const Api = (() => {

  async function fetchProfile(rid) {
    const resp = await fetch(`/api/profile?rid=${encodeURIComponent(rid)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erreur inconnue');
    return data;
  }

  async function fetchDataset(slug) {
    const resp = await fetch(`/api/dataset?slug=${encodeURIComponent(slug)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erreur inconnue');
    return data;
  }

  function extractRid(input) {
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const m = input.match(uuidRe);
    return m ? m[0] : null;
  }

  function extractSlug(input) {
    const m = input.match(/datasets\/([^\/\?#]+)/);
    return m ? m[1] : null;
  }

  return { fetchProfile, fetchDataset, extractRid, extractSlug };
})();
