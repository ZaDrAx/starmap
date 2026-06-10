import { db, collection, getDocs, doc, getDoc } from './config.js';

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, maxZoom: 3, zoomControl: true });
let calqueImageFond = null;
let bounds = [[0,0], [1000,1000]]; // Valeur par défaut

// --- MULTILINGUE ET ACCESSIBILITÉ ---
let currentLang = 'fr';
let currentFontSize = 16;
const astresCharges = []; 
let dernierAstreOuvert = null; 

// Dictionnaire pour l'interface statique
const lexique = {
    fr: { welcome: "Naviguez et cliquez sur un astre pour l'explorer", legend: "Filtres (Légende)", redshift: "Redshift ($z_{CO}$)", masse: "Masse ($M_{\\odot}$)", masseGaz: "Masse Gaz ($M_{\\odot}$)", sfr: "SFR", nonMesure: "Non mesuré", altPhoto: "Photo de l'astre" },
    en: { welcome: "Navigate and click on a celestial body to explore it", legend: "Filters (Legend)", redshift: "Redshift ($z_{CO}$)", masse: "Stellar Mass ($M_{\\odot}$)", masseGaz: "Gas Mass ($M_{\\odot}$)", sfr: "SFR", nonMesure: "Not measured", altPhoto: "Photo of celestial body" },
    es: { welcome: "Navegue y haga clic en un astro para explorarlo", legend: "Filtros (Leyenda)", redshift: "Corrimiento al rojo ($z_{CO}$)", masse: "Masa Estelar ($M_{\\odot}$)", masseGaz: "Masa de Gas ($M_{\\odot}$)", sfr: "SFR", nonMesure: "No medido", altPhoto: "Foto del astro" }
};

const typesTraduction = {
    smg: { fr: "SMG (Galaxie Submillimétrique)", en: "SMG (Submillimeter Galaxy)", es: "SMG (Galaxia Submilimétrica)" },
    lrd: { fr: "LRD (Petit Point Rouge)", en: "LRD (Little Red Dot)", es: "LRD (Pequeño Punto Rojo)" },
    candidate: { fr: "Candidate (Non confirmée)", en: "Candidate (Unconfirmed)", es: "Candidata (No confirmada)" },
    quasar: { fr: "Quasar", en: "Quasar", es: "Quásar" },
    spiral: { fr: "Galaxie Spirale", en: "Spiral Galaxy", es: "Galaxia Espiral" },
    elliptical: { fr: "Galaxie Elliptique", en: "Elliptical Galaxy", es: "Galaxia Elíptica" },
    unknown: { fr: "Inconnu", en: "Unknown", es: "Desconocido" }
};

document.getElementById('lang-selector').addEventListener('change', (e) => {
    currentLang = e.target.value;
    document.getElementById('message-accueil').innerText = lexique[currentLang].welcome;
    document.getElementById('lbl-legend-title').innerText = lexique[currentLang].legend;
    construireLegende();
    astresCharges.forEach(item => { if(item.calque) item.calque.setTooltipContent(item.donnees.nom[currentLang] || item.donnees.nom.fr); });
    if (dernierAstreOuvert) ouvrirPanneau(dernierAstreOuvert);
});

document.getElementById('btn-text-plus').addEventListener('click', () => { currentFontSize = Math.min(currentFontSize + 2, 24); document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px'); });
document.getElementById('btn-text-minus').addEventListener('click', () => { currentFontSize = Math.max(currentFontSize - 2, 12); document.documentElement.style.setProperty('--base-font-size', currentFontSize + 'px'); });


async function initialiserCartePublique() {
    let mapImageUrl = 'map-background.png'; 
    try {
        const docSnap = await getDoc(doc(db, "parametres", "carte"));
        if (docSnap.exists() && docSnap.data().url) mapImageUrl = docSnap.data().url;
    } catch(e) { console.error("Erreur lecture fond :", e); }

    // On charge l'image en mémoire pour lire ses VRAIES dimensions
    const img = new Image();
    img.onload = function() {
        const w = img.naturalWidth || 1000;
        const h = img.naturalHeight || 1000;
        bounds = [[0, 0], [h, w]];
        
        calqueImageFond = L.imageOverlay(mapImageUrl, bounds).addTo(map);
        map.fitBounds(bounds);
        
        // On ne lance le chargement des galaxies qu'une fois la grille bien calibrée !
        chargerCartePublique();
    }
    img.src = mapImageUrl;
}

const panneau = document.getElementById('info-panel');
const btnFermer = document.getElementById('btn-fermer');
const messageAccueil = document.getElementById('message-accueil');
btnFermer.addEventListener('click', () => { panneau.classList.remove('ouvert'); dernierAstreOuvert = null; });
map.on('click', () => { panneau.classList.remove('ouvert'); dernierAstreOuvert = null; });

let currentSlide = 0; let photosActuelles = [];
function afficherSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide'); const dots = document.querySelectorAll('.dot');
    if(slides.length > 0) slides[currentSlide].classList.remove('active'); if(dots.length > 0) dots[currentSlide].classList.remove('active');
    currentSlide = index;
    if(slides.length > 0) slides[currentSlide].classList.add('active'); if(dots.length > 0) dots[currentSlide].classList.add('active');
}
document.getElementById('prev-btn').addEventListener('click', () => { let n = currentSlide - 1; if (n < 0) n = photosActuelles.length - 1; afficherSlide(n); });
document.getElementById('next-btn').addEventListener('click', () => { let n = currentSlide + 1; if (n >= photosActuelles.length) n = 0; afficherSlide(n); });

function construireCarrousel(photos, nomAstre) {
    photosActuelles = photos || []; const container = document.getElementById('carousel-container'); const imagesDiv = document.getElementById('carousel-images'); const dotsDiv = document.getElementById('carousel-dots');
    if (photosActuelles.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block'; imagesDiv.innerHTML = ''; dotsDiv.innerHTML = ''; currentSlide = 0;
    photosActuelles.forEach((url, index) => {
        const img = document.createElement('img'); img.src = url; img.className = `carousel-slide ${index === 0 ? 'active' : ''}`;
        img.alt = `${lexique[currentLang].altPhoto} ${nomAstre} (${index + 1}/${photosActuelles.length})`;
        imagesDiv.appendChild(img);
        if (photosActuelles.length > 1) {
            const dot = document.createElement('div'); dot.className = `dot ${index === 0 ? 'active' : ''}`; dot.addEventListener('click', () => afficherSlide(index)); dotsDiv.appendChild(dot);
        }
    });
    document.getElementById('prev-btn').style.display = photosActuelles.length > 1 ? 'block' : 'none';
    document.getElementById('next-btn').style.display = photosActuelles.length > 1 ? 'block' : 'none';
}

function ouvrirPanneau(donnees) {
    dernierAstreOuvert = donnees; 
    
    const nomTraduit = donnees.nom[currentLang] || donnees.nom.fr;
    const descTraduite = donnees.description[currentLang] || donnees.description.fr;
    const cleType = donnees.typeAstre || "unknown";
    const typeTraduit = typesTraduction[cleType] ? typesTraduction[cleType][currentLang] : typesTraduction.unknown[currentLang];

    document.getElementById('info-nom').innerText = nomTraduit;
    document.getElementById('info-type').innerText = typeTraduit;
    document.getElementById('info-description').innerText = descTraduite;
    
    construireCarrousel(donnees.photos, nomTraduit);

    const grid = document.getElementById('info-grid'); grid.innerHTML = ''; 
    if (donnees.redshift) grid.innerHTML += `<div class="data-card"><span class="data-label">${lexique[currentLang].redshift}</span><span class="data-value">${donnees.redshift}</span></div>`;
    if (donnees.masse) grid.innerHTML += `<div class="data-card"><span class="data-label">${lexique[currentLang].masse}</span><span class="data-value">${donnees.masse}</span></div>`;
    if (donnees.masseGaz) grid.innerHTML += `<div class="data-card"><span class="data-label">${lexique[currentLang].masseGaz}</span><span class="data-value">${donnees.masseGaz}</span></div>`;
    if (donnees.sfr) grid.innerHTML += `<div class="data-card"><span class="data-label">${lexique[currentLang].sfr}</span><span class="data-value">${donnees.sfr}</span></div>`;

    if (donnees.parametresPersonnalises && donnees.parametresPersonnalises[currentLang]) {
        Object.entries(donnees.parametresPersonnalises[currentLang]).forEach(([cle, valeur]) => {
            if(valeur) grid.innerHTML += `<div class="data-card"><span class="data-label">${cle}</span><span class="data-value">${valeur}</span></div>`;
        });
    }

    const conteneurTags = document.getElementById('info-tags'); conteneurTags.innerHTML = ''; 
    const listTags = donnees.tags[currentLang] || donnees.tags.fr || [];
    listTags.forEach(tag => { if(tag) { const span = document.createElement('span'); span.className = 'tag'; span.innerText = tag; conteneurTags.appendChild(span); } });

    renderMathInElement(panneau, { delimiters: [ {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false} ], throwOnError : false });
    messageAccueil.style.opacity = '0'; panneau.classList.add('ouvert'); 
    
    // Focus corrigé pour l'accessibilité
    const infoNom = document.getElementById('info-nom');
    infoNom.setAttribute('tabindex', '-1');
    infoNom.focus();
}

// --- CORRECTION: L'erreur était sur "etatsCoches" ici ! ---
function construireLegende() {
    const conteneurFiltres = document.getElementById('filter-container');
    
    const etatsCoches = {};
    document.querySelectorAll('#filter-container input').forEach(input => { etatsCoches[input.value] = input.checked; });
    
    conteneurFiltres.innerHTML = '';
    const typesPresents = new Set(astresCharges.map(item => item.donnees.typeAstre || "unknown"));

    typesPresents.forEach(typeKey => {
        const label = document.createElement('label'); label.className = 'filter-item';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.value = typeKey;
        checkbox.checked = etatsCoches[typeKey] !== undefined ? etatsCoches[typeKey] : true;
        
        checkbox.addEventListener('change', appliquerFiltresLegende);
        
        const texteAffiche = typesTraduction[typeKey] ? typesTraduction[typeKey][currentLang] : typeKey;
        label.appendChild(checkbox); label.appendChild(document.createTextNode(texteAffiche));
        conteneurFiltres.appendChild(label);
    });
    appliquerFiltresLegende(); 
}

function appliquerFiltresLegende() {
    const typesCoches = Array.from(document.querySelectorAll('#filter-container input:checked')).map(cb => cb.value);
    astresCharges.forEach(item => {
        const typeKey = item.donnees.typeAstre || "unknown";
        if (typesCoches.includes(typeKey)) {
            if (!map.hasLayer(item.calque)) map.addLayer(item.calque);
        } else {
            if (map.hasLayer(item.calque)) map.removeLayer(item.calque);
        }
    });
}

function creerPointsReguliers(y, x, r, c) { let pts = []; for(let i=0; i<c; i++) { let a = (i * 360 / c - 90) * (Math.PI / 180); pts.push([y + r * Math.sin(a), x + r * Math.cos(a)]); } return pts; }
function creerEtoile(y, x, rE, rI, p) { let pts = []; for(let i=0; i<p*2; i++) { let r = (i % 2 === 0) ? rE : rI; let a = (i * 360 / (p*2) - 90) * (Math.PI / 180); pts.push([y + r * Math.sin(a), x + r * Math.cos(a)]); } return pts; }
function genererCalqueForme(forme, coords, taille, style) {
    if (forme === 'cercle') return L.circle(coords, { radius: taille, ...style });
    if (forme === 'carre') return L.rectangle([[coords[0]-taille/2, coords[1]-taille/2], [coords[0]+taille/2, coords[1]+taille/2]], style);
    if (forme === 'triangle') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 3), style);
    if (forme === 'hexagone') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 6), style);
    if (forme === 'etoile') return L.polygon(creerEtoile(coords[0], coords[1], taille, taille/2.5, 5), style);
    if (forme === 'polygone') return L.polygon(coords, style);
    return null;
}

async function chargerCartePublique() {
    try {
        const querySnapshot = await getDocs(collection(db, "galaxies"));
        querySnapshot.forEach((documentFirebase) => {
            const astre = documentFirebase.data(); let coords = []; try { coords = JSON.parse(astre.coordonnees); } catch(e) {}
            const calque = genererCalqueForme(astre.forme, coords, astre.taille, astre.style);
            if (calque) {
                calque.addTo(map);
                calque.bindTooltip(astre.nom[currentLang] || astre.nom.fr, { direction: 'top', className: 'tooltip-perso' });
                calque.on('tooltipopen', (e) => { renderMathInElement(e.tooltip._container, { delimiters: [{left: '$', right: '$', display: false}], throwOnError: false }); });
                calque.on('click', (ev) => { L.DomEvent.stopPropagation(ev); ouvrirPanneau(astre); let centre = astre.forme === 'polygone' ? calque.getBounds().getCenter() : L.latLng(coords[0], coords[1]); map.flyTo(centre, map.getZoom(), { duration: 0.5 }); });
                astresCharges.push({ calque: calque, donnees: astre });
            }
        });
        construireLegende();
    } catch (erreur) { console.error(erreur); }
}