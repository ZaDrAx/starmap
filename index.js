import { db, collection, getDocs } from './config.js';

// --- 1. CONFIGURATION DE LA CARTE ---
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 3,
    zoomControl: true 
});

const bounds = [[0,0], [1000,1000]]; 
L.imageOverlay('map-background.png', bounds).addTo(map);
map.fitBounds(bounds);

// --- 2. GESTION DU PANNEAU LATÉRAL ---
const panneau = document.getElementById('info-panel');
const btnFermer = document.getElementById('btn-fermer');
const messageAccueil = document.getElementById('message-accueil');

// Fermer le panneau quand on clique sur la croix ou dans le vide sur la carte
btnFermer.addEventListener('click', fermerPanneau);
map.on('click', fermerPanneau);

function fermerPanneau() {
    panneau.classList.remove('ouvert');
}

function ouvrirPanneau(donnees) {
    // Remplissage des données textuelles
    document.getElementById('info-nom').innerText = donnees.nom;
    document.getElementById('info-type').innerText = donnees.typeAstre || "Astre inconnu";
    document.getElementById('info-description').innerText = donnees.description;
    
    // Remplissage des données scientifiques (avec une valeur par défaut si vide)
    document.getElementById('info-distance').innerHTML = donnees.distance ? `${donnees.distance} Md AL` : "<span style='color:#555'>Non mesuré</span>";
    document.getElementById('info-masse').innerHTML = donnees.masse ? `${donnees.masse} M☉` : "<span style='color:#555'>Non mesuré</span>";
    document.getElementById('info-gaz').innerHTML = donnees.masseGaz ? `${donnees.masseGaz} M☉` : "<span style='color:#555'>Non mesuré</span>";
    document.getElementById('info-sfr').innerHTML = donnees.sfr ? donnees.sfr : "<span style='color:#555'>Non mesuré</span>";

    // Remplissage des tags
    const conteneurTags = document.getElementById('info-tags');
    conteneurTags.innerHTML = ''; // On vide les anciens tags
    if (donnees.tags && donnees.tags.length > 0) {
        donnees.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.innerText = tag;
            conteneurTags.appendChild(span);
        });
    }

    // On cache le message d'accueil et on ouvre le panneau
    messageAccueil.style.opacity = '0';
    panneau.classList.add('ouvert');
}


// --- 3. MATHÉMATIQUES DES FORMES (Identiques à l'admin pour le rendu visuel) ---
function creerPointsReguliers(y, x, r, cotes) {
    let pts = [];
    for(let i=0; i<cotes; i++) {
        let angle = (i * 360 / cotes - 90) * (Math.PI / 180);
        pts.push([y + r * Math.sin(angle), x + r * Math.cos(angle)]);
    }
    return pts;
}

function creerEtoile(y, x, rExt, rInt, pointes) {
    let pts = [];
    let cotes = pointes * 2;
    for(let i=0; i<cotes; i++) {
        let r = (i % 2 === 0) ? rExt : rInt;
        let angle = (i * 360 / cotes - 90) * (Math.PI / 180);
        pts.push([y + r * Math.sin(angle), x + r * Math.cos(angle)]);
    }
    return pts;
}

function genererCalqueForme(forme, coords, taille, style) {
    if (forme === 'cercle') return L.circle(coords, { radius: taille, ...style });
    if (forme === 'carre') return L.rectangle([[coords[0]-taille/2, coords[1]-taille/2], [coords[0]+taille/2, coords[1]+taille/2]], style);
    if (forme === 'triangle') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 3), style);
    if (forme === 'hexagone') return L.polygon(creerPointsReguliers(coords[0], coords[1], taille, 6), style);
    if (forme === 'etoile') return L.polygon(creerEtoile(coords[0], coords[1], taille, taille/2.5, 5), style);
    if (forme === 'polygone') return L.polygon(coords, style);
    return null;
}


// --- 4. CHARGEMENT DEPUIS FIREBASE ---
async function chargerCartePublique() {
    try {
        const querySnapshot = await getDocs(collection(db, "galaxies"));
        
        querySnapshot.forEach((documentFirebase) => {
            const astre = documentFirebase.data();
            const coords = JSON.parse(astre.coordonnees);
            
            // On génère la forme avec le style sauvegardé
            const calque = genererCalqueForme(astre.forme, coords, astre.taille, astre.style);
            
            if (calque) {
                calque.addTo(map);
                
                // On affiche juste le nom au survol de la souris
                calque.bindTooltip(astre.nom, { direction: 'top', className: 'tooltip-perso' });

                // L'événement le plus important : l'ouverture du panneau au clic !
                calque.on('click', (evenement) => {
                    L.DomEvent.stopPropagation(evenement); // Empêche le clic de traverser et fermer le panneau
                    ouvrirPanneau(astre);
                    
                    // Optionnel : fait un léger zoom et centre la caméra sur l'astre cliqué
                    let centre = astre.forme === 'polygone' ? calque.getBounds().getCenter() : L.latLng(coords[0], coords[1]);
                    map.flyTo(centre, map.getZoom(), { duration: 0.5 });
                });
            }
        });
        
    } catch (erreur) {
        console.error("Erreur lors du chargement :", erreur);
    }
}

// On lance le chargement
chargerCartePublique();