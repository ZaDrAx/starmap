import { db, collection, addDoc, getDocs, doc, updateDoc, setDoc, getDoc } from './config.js';

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, zoomControl: false });
const bounds = [[0,0], [1000,1000]]; 
let calqueImageFond = null;

async function chargerImageFond() {
    let mapImageUrl = 'map-background.png'; 
    try {
        const docSnap = await getDoc(doc(db, "parametres", "carte"));
        if (docSnap.exists() && docSnap.data().url) {
            mapImageUrl = docSnap.data().url;
            document.getElementById('url-fond').value = mapImageUrl;
        }
    } catch(e) { console.error(e); }
    if (calqueImageFond) map.removeLayer(calqueImageFond);
    calqueImageFond = L.imageOverlay(mapImageUrl, bounds).addTo(map);
    map.fitBounds(bounds);
}
chargerImageFond();

// --- LOGIQUE DES ONGLETS PRINCIPAUX ---
document.querySelectorAll('.onglet-btn').forEach(bouton => {
    bouton.addEventListener('click', () => {
        document.querySelectorAll('.onglet-btn').forEach(b => b.classList.remove('active'));
        bouton.classList.add('active');
        ['vue-editeur', 'vue-bibliotheque', 'vue-parametres'].forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        document.getElementById(bouton.getAttribute('data-cible')).style.display = 'block';
    });
});

// --- NOUVEAU : SWITCH DES LANGUES DU FORMULAIRE ---
document.querySelectorAll('.form-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.form-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const langCible = btn.getAttribute('data-lang');
        document.querySelectorAll('.lang-section').forEach(sec => {
            sec.classList.remove('active');
            if(sec.getAttribute('data-form-section') === langCible) sec.classList.add('active');
        });
    });
});

document.getElementById('btn-maj-carte').addEventListener('click', async () => {
    const urlInput = document.getElementById('url-fond').value.trim();
    try {
        await setDoc(doc(db, "parametres", "carte"), { url: urlInput });
        alert("Carte mise à jour !"); await chargerImageFond();
    } catch (e) { alert("Erreur."); }
});

let formeTemporaire = null; let pointsPolygone = []; let historiqueRedo = []; let coordonneesFinales = null; let marqueursSommets = []; let marqueurCentre = null; let polygoneTermine = false; const astresAffiches = {}; 

// --- GESTION DES PHOTOS ---
const conteneurPhotos = document.getElementById('conteneur-photos');
function ajouterChampPhoto(url = '') {
    const ligne = document.createElement('div');
    ligne.className = 'flex-row'; ligne.style.marginBottom = '5px';
    ligne.innerHTML = `<div class="flex-col" style="flex:1;"><input type="text" placeholder="https://..." class="champ-photo-url" value="${url}"></div><button type="button" class="btn-supprimer-champ">✖</button>`;
    ligne.querySelector('.btn-supprimer-champ').addEventListener('click', () => ligne.remove());
    conteneurPhotos.appendChild(ligne);
}
document.getElementById('btn-ajouter-photo').addEventListener('click', () => ajouterChampPhoto());
function recupererPhotos() {
    const photos = [];
    document.querySelectorAll('.champ-photo-url').forEach(input => { if (input.value.trim() !== '') photos.push(input.value.trim()); });
    return photos;
}

// --- GESTION DES PARAMÈTRES PERSOS TRILINGUES ---
const conteneurChampsPerso = document.getElementById('conteneur-champs-perso');
function ajouterChampPersonnalise(nom = '', valFr = '', valEn = '', valEs = '') {
    const ligne = document.createElement('div');
    ligne.className = 'champ-perso-ligne';
    ligne.style.cssText = 'background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid rgba(255,255,255,0.1);';
    ligne.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <select class="latex-helper"><option value="">+ LaTeX...</option><option value="$z_{CO}$">z_CO</option><option value="$L_{IR}$">L_IR</option><option value="$M_{\\odot}$">M_sol</option></select>
            <button type="button" class="btn-supprimer-champ">✖</button>
        </div>
        <input type="text" placeholder="Nom (ex: L_{IR})" class="champ-cle" value="${nom}" style="margin-bottom:5px;">
        <input type="text" placeholder="Valeur FR" class="champ-val-fr" value="${valFr}" style="margin-bottom:3px;">
        <input type="text" placeholder="Valeur EN" class="champ-val-en" value="${valEn}" style="margin-bottom:3px;">
        <input type="text" placeholder="Valeur ES" class="champ-val-es" value="${valEs}">
    `;
    const helper = ligne.querySelector('.latex-helper');
    const inputCle = ligne.querySelector('.champ-cle');
    helper.addEventListener('change', (e) => { if(e.target.value) { inputCle.value += e.target.value; e.target.value = ''; } });
    ligne.querySelector('.btn-supprimer-champ').addEventListener('click', () => ligne.remove());
    conteneurChampsPerso.appendChild(ligne);
}
document.getElementById('btn-ajouter-champ').addEventListener('click', () => ajouterChampPersonnalise());

function recupererChampsPersonnalises() {
    const champs = { fr: {}, en: {}, es: {} };
    document.querySelectorAll('.champ-perso-ligne').forEach(ligne => {
        const cle = ligne.querySelector('.champ-cle').value.trim();
        if (cle !== '') {
            champs.fr[cle] = ligne.querySelector('.champ-val-fr').value.trim();
            champs.en[cle] = ligne.querySelector('.champ-val-en').value.trim();
            champs.es[cle] = ligne.querySelector('.champ-val-es').value.trim();
        }
    });
    return champs;
}

// --- SLIDERS ---
function initialiserSliders() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const bulle = slider.previousElementSibling;
        slider.addEventListener('input', () => {
            const val = slider.value; const min = slider.min ? parseFloat(slider.min) : 0; const max = slider.max ? parseFloat(slider.max) : 100;
            bulle.innerHTML = val; bulle.style.left = `calc(${((val - min) * 100) / (max - min)}% + (${8 - (((val - min) * 100) / (max - min)) * 0.15}px))`;
            if (formeTemporaire && coordonneesFinales) {
                if (document.getElementById('forme').value === 'polygone') formeTemporaire.setStyle(getStyleActuel()); else dessinerFormeFixe();
            }
        });
        slider.dispatchEvent(new Event('input'));
    });
}
initialiserSliders();

// --- MODE ÉDITION / RESET ---
function resetFormulaire() {
    document.getElementById('id-edition').value = ""; document.getElementById('titre-formulaire').innerText = "Nouvel Astre"; document.getElementById('btn-nouveau').style.display = 'none';
    ['fr', 'en', 'es'].forEach(l => {
        document.getElementById(`nom-${l}`).value = ""; document.getElementById(`description-${l}`).value = ""; document.getElementById(`tags-${l}`).value = "";
    });
    document.getElementById('redshift').value = ""; document.getElementById('masse').value = ""; document.getElementById('masse-gaz').value = ""; document.getElementById('sfr').value = "";
    document.getElementById('type-astre').value = "smg"; conteneurChampsPerso.innerHTML = ''; conteneurPhotos.innerHTML = '';
    document.getElementById('taille').value = 30; document.getElementById('opacite-fond').value = 0.5; document.getElementById('epaisseur-contour').value = 2; document.getElementById('opacite-contour').value = 1.0;
    document.querySelectorAll('input[type="range"]').forEach(s => s.dispatchEvent(new Event('input')));
    document.querySelector('#group-forme .btn-option[data-value="cercle"]').click();
    nettoyerCarteEtSommets();
    Object.values(astresAffiches).forEach(item => { if (item.calque && !map.hasLayer(item.calque)) map.addLayer(item.calque); });
}
document.getElementById('btn-nouveau').addEventListener('click', resetFormulaire);

// --- LEAFLET DESSIN ---
document.querySelectorAll('#group-forme .btn-option').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#group-forme .btn-option').forEach(x => x.classList.remove('active')); b.classList.add('active');
    document.getElementById('forme').value = b.getAttribute('data-value');
    document.getElementById('outils-polygone').style.display = b.getAttribute('data-value') === 'polygone' ? 'flex' : 'none'; nettoyerCarteEtSommets();
}));
function nettoyerCarteEtSommets() {
    if (formeTemporaire) map.removeLayer(formeTemporaire); if (marqueurCentre) map.removeLayer(marqueurCentre); marqueursSommets.forEach(m => map.removeLayer(m));
    marqueurCentre = null; marqueursSommets = []; pointsPolygone = []; historiqueRedo = []; coordonneesFinales = null; polygoneTermine = false;
}
function getStyleActuel() { return { fillColor: document.getElementById('couleur-fond').value, fillOpacity: document.getElementById('opacite-fond').value, color: document.getElementById('couleur-contour').value, weight: parseFloat(document.getElementById('epaisseur-contour').value), opacity: document.getElementById('opacite-contour').value }; }
function creerPointsReguliers(y, x, r, cotes) { let pts = []; for(let i=0; i<cotes; i++) { let a = (i * 360 / cotes - 90) * (Math.PI / 180); pts.push([y + r * Math.sin(a), x + r * Math.cos(a)]); } return pts; }
function creerEtoile(y, x, rE, rI, p) { let pts = []; for(let i=0; i<p*2; i++) { let r = (i % 2 === 0) ? rE : rI; let a = (i * 360 / (p*2) - 90) * (Math.PI / 180); pts.push([y + r * Math.sin(a), x + r * Math.cos(a)]); } return pts; }
function genererCalqueForme(forme, coords, taille, style) {
    try {
        if (forme === 'cercle') return L.circle(coords, { radius: taille, ...style });
        if (forme === 'carre') return L.rectangle([[coords[0]-taille/2, coords[1]-taille/2], [coords[0]+taille/2, coords[1]+taille/2]], style);
        if (forme === 'triangle') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 3), style);
        if (forme === 'hexagone') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 6), style);
        if (forme === 'etoile') return L.polygon(creerEtoile(coords[0], coords[1], taille, taille/2.5, 5), style);
        if (forme === 'polygone' && coords.length > 0) return L.polygon(coords, style);
    } catch (e) {} return null;
}
function dessinerFormeFixe() { if (formeTemporaire) map.removeLayer(formeTemporaire); const calque = genererCalqueForme(document.getElementById('forme').value, coordonneesFinales, parseInt(document.getElementById('taille').value), getStyleActuel()); if (calque) formeTemporaire = calque.addTo(map); }
function creerAncreDeplacement(lat, lng) {
    if (marqueurCentre) map.removeLayer(marqueurCentre); const icone = L.divIcon({ className: 'move-marker', html: '✥', iconSize: [24, 24], iconAnchor: [12, 12] });
    marqueurCentre = L.marker([lat, lng], { draggable: true, icon: icone }).addTo(map);
    marqueurCentre.on('drag', (e) => { coordonneesFinales = [e.latlng.lat, e.latlng.lng]; dessinerFormeFixe(); });
}
function creerMarqueurSommet(lat, lng, idx) {
    const icone = L.divIcon({ className: 'vertex-marker', iconSize: [14, 14] }); const m = L.marker([lat, lng], { draggable: true, icon: icone }).addTo(map);
    m.on('drag', (e) => { pointsPolygone[idx] = [e.latlng.lat, e.latlng.lng]; dessinerPolygoneActuel(); coordonneesFinales = [...pointsPolygone]; }); marqueursSommets.push(m);
}
map.on('click', function(e) {
    if(document.getElementById('vue-editeur').style.display !== 'block') return; const forme = document.getElementById('forme').value;
    if (forme !== 'polygone') { if (coordonneesFinales !== null) return; coordonneesFinales = [e.latlng.lat, e.latlng.lng]; dessinerFormeFixe(); creerAncreDeplacement(e.latlng.lat, e.latlng.lng); } 
    else { if (polygoneTermine) return; const idx = pointsPolygone.length; pointsPolygone.push([e.latlng.lat, e.latlng.lng]); creerMarqueurSommet(e.latlng.lat, e.latlng.lng, idx); dessinerPolygoneActuel(); coordonneesFinales = [...pointsPolygone]; }
});
function dessinerPolygoneActuel() { if (formeTemporaire) map.removeLayer(formeTemporaire); if (pointsPolygone.length > 0) formeTemporaire = L.polygon(pointsPolygone, getStyleActuel()).addTo(map); }
document.getElementById('btn-undo').addEventListener('click', () => { if (pointsPolygone.length > 0 && !polygoneTermine) { historiqueRedo.push(pointsPolygone.pop()); map.removeLayer(marqueursSommets.pop()); dessinerPolygoneActuel(); coordonneesFinales = [...pointsPolygone]; } });
document.getElementById('btn-terminer').addEventListener('click', () => { if (pointsPolygone.length > 2) { polygoneTermine = true; alert("Forme verrouillée !"); } });

// --- SAUVEGARDE EN FORMAT TRILINGUE ---
document.getElementById('btn-sauvegarder').addEventListener('click', async () => {
    const idEdition = document.getElementById('id-edition').value;
    const nomFr = document.getElementById('nom-fr').value.trim();
    if (!nomFr || !coordonneesFinales) return alert("Remplissez au moins le nom (FR) et dessinez une forme.");

    const donnees = {
        nom: { fr: nomFr, en: document.getElementById('nom-en').value.trim() || nomFr, es: document.getElementById('nom-es').value.trim() || nomFr },
        description: { fr: document.getElementById('description-fr').value, en: document.getElementById('description-en').value || document.getElementById('description-fr').value, es: document.getElementById('description-es').value || document.getElementById('description-fr').value },
        tags: { fr: document.getElementById('tags-fr').value.split(',').map(t=>t.trim()), en: document.getElementById('tags-en').value.split(',').map(t=>t.trim()), es: document.getElementById('tags-es').value.split(',').map(t=>t.trim()) },
        typeAstre: document.getElementById('type-astre').value, // Clé agnostique (ex: 'smg')
        redshift: document.getElementById('redshift').value,
        masse: document.getElementById('masse').value,
        masseGaz: document.getElementById('masse-gaz').value,
        sfr: document.getElementById('sfr').value,
        photos: recupererPhotos(),
        parametresPersonnalises: recupererChampsPersonnalises(),
        forme: document.getElementById('forme').value,
        taille: parseInt(document.getElementById('taille').value),
        coordonnees: JSON.stringify(coordonneesFinales),
        style: getStyleActuel()
    };

    try {
        if (idEdition) await updateDoc(doc(db, "galaxies", idEdition), donnees);
        else await addDoc(collection(db, "galaxies"), donnees);
        resetFormulaire(); await chargerListeEtCarte();
        document.querySelector('.onglet-btn[data-cible="vue-bibliotheque"]').click();
    } catch (e) { alert("Erreur: " + e.message); }
});

// --- CHARGEMENT ---
async function chargerListeEtCarte() {
    Object.values(astresAffiches).forEach(item => { if (item.calque && map.hasLayer(item.calque)) map.removeLayer(item.calque); });
    for (const cle in astresAffiches) delete astresAffiches[cle];
    document.getElementById('liste-astres').innerHTML = '';
    const querySnapshot = await getDocs(collection(db, "galaxies"));
    
    querySnapshot.forEach((documentFirebase) => {
        const astre = documentFirebase.data(); const id = documentFirebase.id;
        let coords = []; try { coords = JSON.parse(astre.coordonnees); } catch(e) {}
        const calque = genererCalqueForme(astre.forme, coords, astre.taille, astre.style);
        if (calque) { calque.addTo(map); calque.bindTooltip(astre.nom.fr); }

        const li = document.createElement('li');
        li.innerHTML = `<span>✏️ ${astre.nom.fr}</span>`;
        li.addEventListener('click', () => {
            document.querySelector('.onglet-btn[data-cible="vue-editeur"]').click();
            Object.values(astresAffiches).forEach(a => { if(a.calque && map.hasLayer(a.calque)) map.removeLayer(a.calque); });
            
            document.getElementById('id-edition').value = id;
            document.getElementById('titre-formulaire').innerText = "Modifier : " + astre.nom.fr;
            document.getElementById('btn-nouveau').style.display = 'block';

            ['fr', 'en', 'es'].forEach(l => {
                document.getElementById(`nom-${l}`).value = astre.nom[l] || "";
                document.getElementById(`description-${l}`).value = astre.description[l] || "";
                document.getElementById(`tags-${l}`).value = astre.tags && astre.tags[l] ? astre.tags[l].join(', ') : "";
            });
            
            document.getElementById('type-astre').value = astre.typeAstre || "smg";
            document.getElementById('redshift').value = astre.redshift || "";
            document.getElementById('masse').value = astre.masse || "";
            document.getElementById('masse-gaz').value = astre.masseGaz || "";
            document.getElementById('sfr').value = astre.sfr || "";
            
            conteneurChampsPerso.innerHTML = '';
            if (astre.parametresPersonnalises && astre.parametresPersonnalises.fr) {
                Object.keys(astre.parametresPersonnalises.fr).forEach(cle => {
                    ajouterChampPersonnalise(cle, astre.parametresPersonnalises.fr[cle], astre.parametresPersonnalises.en[cle], astre.parametresPersonnalises.es[cle]);
                });
            }
            conteneurPhotos.innerHTML = ''; if (astre.photos) astre.photos.forEach(url => ajouterChampPhoto(url));
            
            document.getElementById('taille').value = astre.taille; document.getElementById('opacite-fond').value = astre.style.fillOpacity; document.getElementById('epaisseur-contour').value = astre.style.weight; document.getElementById('opacite-contour').value = astre.style.opacity || 1;
            document.querySelectorAll('input[type="range"]').forEach(s => s.dispatchEvent(new Event('input')));
            document.getElementById('couleur-fond').value = astre.style.fillColor; document.getElementById('couleur-contour').value = astre.style.color;
            document.querySelector(`#group-forme .btn-option[data-value="${astre.forme}"]`).click();

            coordonneesFinales = coords;
            if (astre.forme === 'polygone' && Array.isArray(coords)) {
                polygoneTermine = true; pointsPolygone = [...coords]; dessinerPolygoneActuel();
                pointsPolygone.forEach((pt, idx) => creerMarqueurSommet(pt[0], pt[1], idx));
            } else if (coords && coords.length >= 2) { dessinerFormeFixe(); creerAncreDeplacement(coords[0], coords[1]); }
        });
        document.getElementById('liste-astres').appendChild(li);
        astresAffiches[id] = { calque: calque, li: li, donnees: astre };
    });
}
chargerListeEtCarte();