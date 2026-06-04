import { db, collection, addDoc, getDocs, doc, updateDoc } from './config.js';

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -2, zoomControl: false });
const bounds = [[0,0], [1000,1000]]; 
L.imageOverlay('map-background.png', bounds).addTo(map);
map.fitBounds(bounds);

let formeTemporaire = null;
let pointsPolygone = []; 
let historiqueRedo = []; 
let coordonneesFinales = null; 
let marqueursSommets = []; 
const astresAffiches = {}; 

// --- GESTION DES CHAMPS PERSONNALISÉS ---
const conteneurChampsPerso = document.getElementById('conteneur-champs-perso');

function ajouterChampPersonnalise(nom = '', valeur = '') {
    const ligne = document.createElement('div');
    ligne.className = 'flex-row champ-perso-ligne';
    ligne.style.marginBottom = '10px';
    ligne.innerHTML = `
        <div class="flex-col" style="flex: 1;"><input type="text" placeholder="Nom (ex: Luminosité)" class="champ-cle" value="${nom}"></div>
        <div class="flex-col" style="flex: 1;"><input type="text" placeholder="Valeur" class="champ-valeur" value="${valeur}"></div>
        <button type="button" class="btn-supprimer-champ" title="Supprimer">✖</button>
    `;
    
    // Action de suppression
    ligne.querySelector('.btn-supprimer-champ').addEventListener('click', () => {
        ligne.remove();
    });
    
    conteneurChampsPerso.appendChild(ligne);
}

document.getElementById('btn-ajouter-champ').addEventListener('click', () => {
    ajouterChampPersonnalise();
});

function recupererChampsPersonnalises() {
    const champs = {};
    document.querySelectorAll('.champ-perso-ligne').forEach(ligne => {
        const cle = ligne.querySelector('.champ-cle').value.trim();
        const valeur = ligne.querySelector('.champ-valeur').value.trim();
        if (cle !== '' && valeur !== '') {
            champs[cle] = valeur;
        }
    });
    return champs;
}


// --- ANIMATION DES SLIDERS ---
function initialiserSliders() {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const bulle = slider.previousElementSibling;
        slider.addEventListener('input', () => {
            const val = slider.value;
            const min = slider.min ? parseFloat(slider.min) : 0;
            const max = slider.max ? parseFloat(slider.max) : 100;
            const percent = ((val - min) * 100) / (max - min);
            
            bulle.innerHTML = val;
            bulle.style.left = `calc(${percent}% + (${8 - percent * 0.15}px))`;
            
            if (formeTemporaire && coordonneesFinales) {
                if (document.getElementById('forme').value === 'polygone') {
                    formeTemporaire.setStyle(getStyleActuel());
                } else {
                    map.fire('click', { latlng: L.latLng(coordonneesFinales[0], coordonneesFinales[1]) });
                }
            }
        });
        slider.dispatchEvent(new Event('input'));
    });
}
initialiserSliders();

['couleur-fond', 'couleur-contour'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (formeTemporaire) formeTemporaire.setStyle(getStyleActuel());
    });
});

document.querySelectorAll('#group-forme .btn-option').forEach(bouton => {
    bouton.addEventListener('click', () => {
        document.querySelectorAll('#group-forme .btn-option').forEach(b => b.classList.remove('active'));
        bouton.classList.add('active');
        document.getElementById('forme').value = bouton.getAttribute('data-value');
        
        document.getElementById('outils-polygone').style.display = 
            bouton.getAttribute('data-value') === 'polygone' ? 'flex' : 'none';
            
        nettoyerCarteEtSommets();
    });
});

function nettoyerCarteEtSommets() {
    if (formeTemporaire) map.removeLayer(formeTemporaire);
    marqueursSommets.forEach(m => map.removeLayer(m));
    marqueursSommets = [];
    pointsPolygone = [];
    historiqueRedo = [];
    coordonneesFinales = null;
}

function getStyleActuel() {
    const epaisseur = parseFloat(document.getElementById('epaisseur-contour').value);
    return {
        fillColor: document.getElementById('couleur-fond').value,
        fillOpacity: document.getElementById('opacite-fond').value,
        color: document.getElementById('couleur-contour').value,
        weight: epaisseur,
        opacity: document.getElementById('opacite-contour').value
    };
}

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

function creerMarqueurSommet(lat, lng, index) {
    const iconePoint = L.divIcon({ className: 'vertex-marker', iconSize: [14, 14] });
    const marker = L.marker([lat, lng], { draggable: true, icon: iconePoint }).addTo(map);
    
    marker.on('drag', (e) => {
        pointsPolygone[index] = [e.latlng.lat, e.latlng.lng];
        dessinerPolygoneActuel();
        coordonneesFinales = [...pointsPolygone];
    });
    
    marqueursSommets.push(marker);
}

map.on('click', function(e) {
    const forme = document.getElementById('forme').value;
    const y = e.latlng.lat;
    const x = e.latlng.lng;

    if (forme !== 'polygone') {
        nettoyerCarteEtSommets();
        coordonneesFinales = [y, x]; 
        formeTemporaire = genererCalqueForme(forme, coordonneesFinales, parseInt(document.getElementById('taille').value), getStyleActuel()).addTo(map);
    } 
    else {
        const nouvelIndex = pointsPolygone.length;
        pointsPolygone.push([y, x]);
        historiqueRedo = []; 
        
        creerMarqueurSommet(y, x, nouvelIndex);
        dessinerPolygoneActuel();
        coordonneesFinales = [...pointsPolygone];
    }
});

function dessinerPolygoneActuel() {
    if (formeTemporaire) map.removeLayer(formeTemporaire);
    if (pointsPolygone.length > 0) formeTemporaire = L.polygon(pointsPolygone, getStyleActuel()).addTo(map);
}

function undo() {
    if (pointsPolygone.length > 0) { 
        historiqueRedo.push(pointsPolygone.pop()); 
        const dernierMarqueur = marqueursSommets.pop();
        map.removeLayer(dernierMarqueur);
        dessinerPolygoneActuel(); 
        coordonneesFinales = [...pointsPolygone];
    }
}
function redo() {
    if (historiqueRedo.length > 0) { 
        const pt = historiqueRedo.pop();
        pointsPolygone.push(pt); 
        creerMarqueurSommet(pt[0], pt[1], pointsPolygone.length - 1);
        dessinerPolygoneActuel(); 
        coordonneesFinales = [...pointsPolygone];
    }
}

document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-terminer').addEventListener('click', () => {
    if (pointsPolygone.length > 2) {
        alert("Forme validée ! Vous pouvez ajuster les points ou enregistrer.");
    } else alert("Il faut au moins 3 points.");
});

document.addEventListener('keydown', (e) => {
    if (document.getElementById('forme').value === 'polygone') {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    }
});

// --- SAUVEGARDE DE TOUTES LES DONNÉES ---
document.getElementById('btn-sauvegarder').addEventListener('click', async () => {
    const idEdition = document.getElementById('id-edition').value;
    const nom = document.getElementById('nom').value;
    
    if (!nom || !coordonneesFinales) return alert("Remplissez le nom et dessinez une forme.");

    const tagsBruts = document.getElementById('tags').value.split(',');
    const tagsPropres = tagsBruts.map(t => t.trim()).filter(t => t !== "");

    const donnees = {
        nom: nom,
        description: document.getElementById('description').value,
        tags: tagsPropres,
        
        typeAstre: document.getElementById('type-astre').value,
        distance: document.getElementById('distance').value,
        masse: document.getElementById('masse').value,
        masseGaz: document.getElementById('masse-gaz').value,
        sfr: document.getElementById('sfr').value,
        
        // On récupère et on insère l'objet des paramètres sur mesure
        parametresPersonnalises: recupererChampsPersonnalises(),

        forme: document.getElementById('forme').value,
        taille: parseInt(document.getElementById('taille').value),
        coordonnees: JSON.stringify(coordonneesFinales),
        style: getStyleActuel()
    };

    try {
        if (idEdition) await updateDoc(doc(db, "galaxies", idEdition), donnees);
        else await addDoc(collection(db, "galaxies"), donnees);
        window.location.reload(); 
    } catch (erreur) { console.error(erreur); }
});

// --- CHARGEMENT ---
async function chargerListeEtCarte() {
    const liste = document.getElementById('liste-astres');
    const querySnapshot = await getDocs(collection(db, "galaxies"));
    
    querySnapshot.forEach((documentFirebase) => {
        const astre = documentFirebase.data();
        const id = documentFirebase.id;
        
        const coords = JSON.parse(astre.coordonnees);
        const calque = genererCalqueForme(astre.forme, coords, astre.taille, astre.style).addTo(map);
        calque.bindTooltip(astre.nom); 

        const li = document.createElement('li');
        let tagsHTML = astre.tags ? astre.tags.map(t => `<span class="tag-badge">${t}</span>`).join('') : "";
        li.innerHTML = `<span>✏️ ${astre.nom}</span> <div>${tagsHTML}</div>`;
        
        li.addEventListener('click', () => {
            Object.values(astresAffiches).forEach(a => map.hasLayer(a.calque) && map.removeLayer(a.calque));
            
            document.getElementById('id-edition').value = id;
            document.getElementById('titre-formulaire').innerText = "Modifier : " + astre.nom;
            
            // Ouvre automatiquement la section "Informations Générales"
            document.querySelector('details').open = true;

            document.getElementById('nom').value = astre.nom || "";
            document.getElementById('description').value = astre.description || "";
            document.getElementById('tags').value = astre.tags ? astre.tags.join(', ') : "";
            
            document.getElementById('type-astre').value = astre.typeAstre || "Galaxie Spirale";
            document.getElementById('distance').value = astre.distance || "";
            document.getElementById('masse').value = astre.masse || "";
            document.getElementById('masse-gaz').value = astre.masseGaz || "";
            document.getElementById('sfr').value = astre.sfr || "";
            
            // Vidage et rechargement des champs personnalisés
            conteneurChampsPerso.innerHTML = '';
            if (astre.parametresPersonnalises) {
                Object.entries(astre.parametresPersonnalises).forEach(([cle, valeur]) => {
                    ajouterChampPersonnalise(cle, valeur);
                });
            }
            
            document.getElementById('taille').value = astre.taille;
            document.getElementById('opacite-fond').value = astre.style.fillOpacity;
            document.getElementById('epaisseur-contour').value = astre.style.weight;
            document.getElementById('opacite-contour').value = astre.style.opacity !== undefined ? astre.style.opacity : 1;
            
            document.querySelectorAll('input[type="range"]').forEach(s => s.dispatchEvent(new Event('input')));
            
            document.getElementById('couleur-fond').value = astre.style.fillColor;
            document.getElementById('couleur-contour').value = astre.style.color;

            document.querySelector(`#group-forme .btn-option[data-value="${astre.forme}"]`).click();

            coordonneesFinales = JSON.parse(astre.coordonnees);
            if (astre.forme === 'polygone') {
                pointsPolygone = [...coordonneesFinales];
                dessinerPolygoneActuel();
                pointsPolygone.forEach((pt, idx) => creerMarqueurSommet(pt[0], pt[1], idx));
            } else {
                map.fire('click', { latlng: L.latLng(coordonneesFinales[0], coordonneesFinales[1]) });
            }
        });
        
        liste.appendChild(li);
        astresAffiches[id] = { calque: calque, li: li, donnees: astre };
    });
}

function appliquerFiltres() {
    const rechercheTexte = document.getElementById('filtre-tags').value.toLowerCase();
    const rechercheForme = document.getElementById('filtre-forme').value;

    Object.values(astresAffiches).forEach(item => {
        const correspondTexte = rechercheTexte === "" || 
            item.donnees.nom.toLowerCase().includes(rechercheTexte) ||
            (item.donnees.tags && item.donnees.tags.some(t => t.toLowerCase().includes(rechercheTexte)));
            
        const correspondForme = rechercheForme === "" || item.donnees.forme === rechercheForme;
        const estEnEdition = document.getElementById('id-edition').value === item.id;

        if (correspondTexte && correspondForme) {
            item.li.style.display = 'flex';
            if (!map.hasLayer(item.calque) && !estEnEdition) map.addLayer(item.calque);
        } else {
            item.li.style.display = 'none';
            if (map.hasLayer(item.calque)) map.removeLayer(item.calque);
        }
    });
}

document.getElementById('filtre-tags').addEventListener('input', appliquerFiltres);
document.getElementById('filtre-forme').addEventListener('change', appliquerFiltres);

chargerListeEtCarte();