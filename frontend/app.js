// ══════════════════════════════════════════
// CONSTANTS & DATA
// ══════════════════════════════════════════
const STORE_KEY = 'stem_notes_v3'; // localStorage only for offline notes
const API_BASE  = '/api';

// ── API / Auth layer ──────────────────────────────────────────────────
// Access token lives in memory only (never localStorage / sessionStorage)
let _accessToken = null;

async function _apiCall(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // sends the httpOnly refresh-token cookie
  };
  if (_accessToken) opts.headers['Authorization'] = 'Bearer ' + _accessToken;
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res = await fetch(API_BASE + path, opts);

  // Transparent access-token refresh on 401
  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await _tryRefresh();
    if (refreshed) {
      opts.headers['Authorization'] = 'Bearer ' + _accessToken;
      res = await fetch(API_BASE + path, opts);
    }
  }
  return res;
}

async function _tryRefresh() {
  try {
    const res = await fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;
    const data = await res.json();
    _accessToken = data.accessToken;
    _hydrateFromServer(data.user);
    return true;
  } catch { return false; }
}

function _hydrateFromServer(user) {
  if (!user) return;
  currentUser = user;
  if (!DB.users) DB.users = [];
  const idx = DB.users.findIndex(u => u.id === user.id);
  if (idx >= 0) DB.users[idx] = user;
  else DB.users.push(user);
  DB.currentUserId = user.id;
  // Populate linked user profiles for the messaging screen
  (user.linkedUserProfiles || []).forEach(lp => {
    const i = DB.users.findIndex(u => u.id === lp.id);
    if (i >= 0) DB.users[i] = Object.assign({}, DB.users[i], lp);
    else DB.users.push(lp);
  });
}

// Simple HTML-escape for rendering user-generated text via innerHTML
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// English Level Stages
const EN_STAGES = [
  { min:0,  max:20,  label:'🇫🇷 Francophone',   desc:'Cours principalement en français',  mix:.05 },
  { min:20, max:40,  label:'🌱 Débutant EN',      desc:'Introduction des mots anglais',     mix:.20 },
  { min:40, max:60,  label:'⚡ Initié EN',         desc:'Phrases bilingues équilibrées',     mix:.45 },
  { min:60, max:80,  label:'🚀 Intermédiaire',    desc:'Majorité en anglais, support FR',   mix:.70 },
  { min:80, max:100, label:'🌟 Bilingue STEM',    desc:'Cours en anglais, notes en FR',     mix:.95 },
];

// ══════════════════════════════════════════
// FULL US 8th GRADE + CAMEROON SUBJECTS
// ══════════════════════════════════════════
const SUBJECTS = {
  math:    { name:'Mathématiques', nameEn:'Mathematics', icon:'🧮', cls:'sc-math', badge:'2nde C', chapters:[
    { id:'m1', title:'Logique & Ensembles', en:'Logic & Sets', key:'l_math_logic' },
    { id:'m2', title:'Nombres Réels', en:'Real Numbers', key:'l_math_reels' },
    { id:'m3', title:'Équations & Inéquations', en:'Equations & Inequalities', key:'l_math_eq' },
    { id:'m4', title:'Fonctions Numériques', en:'Numerical Functions', key:'l_math_func' },
    { id:'m5', title:'Trigonométrie', en:'Trigonometry', key:'l_math_trigo' },
    { id:'m6', title:'Vecteurs', en:'Vectors', key:'l_math_vect' },
    { id:'m7', title:'Statistiques', en:'Statistics & Probability', key:'l_math_stats' },
    { id:'m8', title:'Algèbre US (Bridge)', en:'US Algebra I Bridge', key:'l_math_us' },
  ]},
  phys:    { name:'Physique', nameEn:'Physics', icon:'⚡', cls:'sc-phys', badge:'2nde C', chapters:[
    { id:'p1', title:'Cinématique', en:'Kinematics', key:'l_phys_cin' },
    { id:'p2', title:'Lois de Newton', en:"Newton's Laws", key:'l_phys_newton' },
    { id:'p3', title:'Optique Géométrique', en:'Optics', key:'l_phys_opt' },
    { id:'p4', title:'Circuits Électriques', en:'Electric Circuits', key:'l_phys_elec' },
    { id:'p5', title:'Énergie & Travail', en:'Energy & Work', key:'l_phys_energy' },
  ]},
  chem:    { name:'Chimie', nameEn:'Chemistry', icon:'🧪', cls:'sc-chem', badge:'2nde C', chapters:[
    { id:'c1', title:'Structure de la Matière', en:'Structure of Matter', key:'l_chem_matter' },
    { id:'c2', title:'Atomes & Molécules', en:'Atoms & Molecules', key:'l_chem_atoms' },
    { id:'c3', title:'Réactions Chimiques', en:'Chemical Reactions', key:'l_chem_react' },
    { id:'c4', title:'Acides & Bases', en:'Acids & Bases', key:'l_chem_acids' },
  ]},
  ela:     { name:'English Language Arts', nameEn:'English Language Arts', icon:'📖', cls:'sc-ela', badge:'🇺🇸 ELA', isNew:true, chapters:[
    { id:'e1', title:'Reading Comprehension', en:'Reading Comprehension', key:'l_ela_read' },
    { id:'e2', title:'Grammar & Mechanics', en:'Grammar & Mechanics', key:'l_ela_gram' },
    { id:'e3', title:'Writing – Essays', en:'Essay Writing', key:'l_ela_write' },
    { id:'e4', title:'Literary Analysis', en:'Literary Analysis', key:'l_ela_lit' },
    { id:'e5', title:'Public Speaking', en:'Public Speaking & Presentations', key:'l_ela_speak' },
  ]},
  sci:     { name:'Life Science', nameEn:'Life Science / Biology', icon:'🧬', cls:'sc-sci', badge:'🇺🇸 8th', chapters:[
    { id:'s1', title:'La Cellule Vivante', en:'The Living Cell', key:'l_sci_cell' },
    { id:'s2', title:'Génétique & ADN', en:'Genetics & DNA', key:'l_sci_gen' },
    { id:'s3', title:'Évolution', en:'Evolution & Natural Selection', key:'l_sci_evol' },
    { id:'s4', title:'Écosystèmes', en:'Ecosystems & Environment', key:'l_sci_eco' },
    { id:'s5', title:'Corps Humain', en:'Human Body Systems', key:'l_sci_body' },
  ]},
  earth:   { name:'Earth & Space', nameEn:'Earth & Space Science', icon:'🌍', cls:'sc-earth', badge:'🇺🇸 8th', chapters:[
    { id:'es1', title:'Système Solaire', en:'Solar System', key:'l_earth_solar' },
    { id:'es2', title:'Structure de la Terre', en:"Earth's Structure", key:'l_earth_struct' },
    { id:'es3', title:'Changement Climatique', en:'Climate Change', key:'l_earth_climate' },
    { id:'es4', title:'Météorologie', en:'Weather & Atmosphere', key:'l_earth_weather' },
  ]},
  ushist:  { name:'US History', nameEn:'United States History', icon:'🗽', cls:'sc-ushist', badge:'🇺🇸 Social', isNew:true, chapters:[
    { id:'h1', title:'Les Fondateurs & Révolution', en:'Founders & American Revolution', key:'l_hist_rev' },
    { id:'h2', title:'Constitution & Droits', en:'Constitution & Bill of Rights', key:'l_hist_const' },
    { id:'h3', title:'Guerre Civile & Réforme', en:'Civil War & Reconstruction', key:'l_hist_civil' },
    { id:'h4', title:'Droits Civiques', en:'Civil Rights Movement', key:'l_hist_cr' },
    { id:'h5', title:'USA Moderne', en:'Modern America (20th–21st c.)', key:'l_hist_modern' },
  ]},
  civics:  { name:'Civics & Government', nameEn:'Civics & Government', icon:'🏛️', cls:'sc-civics', badge:'🇺🇸 Social', isNew:true, chapters:[
    { id:'cv1', title:'Branches du Gouvernement', en:'3 Branches of Government', key:'l_civ_branches' },
    { id:'cv2', title:'Droits & Libertés', en:'Rights & Freedoms', key:'l_civ_rights' },
    { id:'cv3', title:'Immigration & Citoyenneté', en:'Immigration & Citizenship', key:'l_civ_immigr' },
    { id:'cv4', title:'Voter & Démocratie', en:'Voting & Democracy', key:'l_civ_vote' },
  ]},
  cs:      { name:'Computer Science', nameEn:'Computer Science', icon:'💻', cls:'sc-cs', badge:'🇺🇸 STEM', chapters:[
    { id:'cs1', title:'Algorithmique', en:'Algorithms & Logic', key:'l_cs_algo' },
    { id:'cs2', title:'Python Initiation', en:'Python Programming', key:'l_cs_python' },
    { id:'cs3', title:'Internet & Sécurité', en:'Internet & Cybersecurity', key:'l_cs_net' },
    { id:'cs4', title:'Intelligence Artificielle', en:'Artificial Intelligence Basics', key:'l_cs_ai' },
  ]},
  health:  { name:'Éducation à la Santé', nameEn:'Health Education', icon:'🫀', cls:'sc-health', badge:'🇺🇸 Health', isNew:true, chapters:[
    { id:'hl1', title:'Nutrition & Alimentation', en:'Nutrition & Healthy Eating', key:'l_hlth_nutr' },
    { id:'hl2', title:'Santé Mentale', en:'Mental Health & Wellness', key:'l_hlth_mental' },
    { id:'hl3', title:'Premiers Secours', en:'First Aid & Safety', key:'l_hlth_first' },
    { id:'hl4', title:'Adolescence & Croissance', en:'Adolescence & Growth', key:'l_hlth_teen' },
  ]},
  finance: { name:'Éducation Financière', nameEn:'Financial Literacy', icon:'💰', cls:'sc-finance', badge:'🇺🇸 Life', isNew:true, chapters:[
    { id:'fi1', title:'L\'Argent aux USA', en:'Money in the US', key:'l_fin_money' },
    { id:'fi2', title:'Compte bancaire', en:'Banking Basics', key:'l_fin_bank' },
    { id:'fi3', title:'Budget & Épargne', en:'Budgeting & Saving', key:'l_fin_budget' },
    { id:'fi4', title:'Bourses scolaires', en:'Scholarships & College Aid', key:'l_fin_schol' },
  ]},
  art:     { name:'Art & Musique', nameEn:'Arts & Music Appreciation', icon:'🎨', cls:'sc-art', badge:'🇺🇸 Arts', isNew:true, chapters:[
    { id:'ar1', title:'Histoire de l\'Art', en:'Art History Overview', key:'l_art_hist' },
    { id:'ar2', title:'Musique Américaine', en:'American Music Traditions', key:'l_art_music' },
    { id:'ar3', title:'Arts Africains & Diaspora', en:'African & Diaspora Arts', key:'l_art_africa' },
  ]},
  french:  { name:'Français (Atout!)', nameEn:'French – Your Advantage!', icon:'🗼', cls:'sc-french', badge:'Avantage', chapters:[
    { id:'fr1', title:'Rédaction & Grammaire', en:'Writing & Grammar FR', key:'l_fr_gram' },
    { id:'fr2', title:'Littérature Francophone', en:'Francophone Literature', key:'l_fr_lit' },
    { id:'fr3', title:'Français comme atout aux USA', en:'French as a Career Asset', key:'l_fr_asset' },
  ]},
  integr:  { name:'Intégration USA', nameEn:'US Life & Integration', icon:'🇺🇸', cls:'sc-integr', badge:'Priorité', isNew:true, chapters:[
    { id:'i1', title:'Système scolaire US', en:'US School System Guide', key:'l_int_school' },
    { id:'i2', title:'1er Jour à l\'école US', en:'Your First Day at US School', key:'l_int_day1' },
    { id:'i3', title:'Vie sociale américaine', en:'American Social Life', key:'l_int_social' },
    { id:'i4', title:'Transport & Sécurité', en:'Transportation & Safety', key:'l_int_transport' },
    { id:'i5', title:'Santé & Assurance US', en:'Healthcare & Insurance in US', key:'l_int_health' },
    { id:'i6', title:'Prépa Université', en:'College Prep (Start Now!)', key:'l_int_college' },
  ]},
  pe:      { name:'Éducation Physique', nameEn:'Physical Education & Health', icon:'🏃🏾‍♀️', cls:'sc-pe', badge:'🇺🇸 PE', isNew:true, chapters:[
    { id:'pe1', title:'Sports Américains', en:'American Sports Culture', key:'l_pe_sports' },
    { id:'pe2', title:'Fitness & Bien-être', en:'Fitness & Wellness', key:'l_pe_fit' },
  ]},
};

// ══════════════════════════════════════════
// LESSON CONTENT (bilingual, progressive)
// ══════════════════════════════════════════
const LESSONS = {
  l_phys_newton: {
    title:'Lois de Newton', titleEn:"Newton's Laws of Motion",
    tags:['Physique 2nde C','US Physical Science','L\'Excellence PC'],
    quizKey:'q_newton',
    fr:`<h3>🍎 Les Trois Lois de Newton</h3>
<p>Isaac Newton (1643–1727) a énoncé trois lois fondamentales du mouvement qui régissent tout dans l'univers, des moto-taxis de Douala aux fusées de la NASA!</p>
<h4>1ère Loi – Principe d'Inertie</h4>
<p>Tout corps reste en état de repos ou de mouvement rectiligne uniforme tant qu'aucune <strong>force extérieure</strong> ne vient modifier cet état.</p>
<div class="formula-box">∑F⃗ = 0⃗ ⟺ v = constante</div>
<div class="example-box"><div class="ex-label">🛵 Moto-taxi à Yaoundé</div>Un moto-taxi roulant à vitesse constante sur la route de Mvog-Mbi : si toutes les forces s'annulent (moteur = frottements), la vitesse reste constante. Sans frottements, il roulerait pour toujours!</div>
<h4>2ème Loi – Principe Fondamental (PFD)</h4>
<div class="formula-box">∑F⃗ = m × a⃗ (N = kg·m/s²)</div>
<div class="example-box"><div class="ex-label">🥭 Mangue à Douala</div>Une mangue (m = 0,3 kg) tombe d'un toit. F = m×g = 0,3×10 = <strong>3 N</strong>. Son accélération = g = 10 m/s² vers le bas.</div>
<h4>3ème Loi – Actions Réciproques</h4>
<div class="formula-box">F⃗(A→B) = −F⃗(B→A)</div>
<div class="example-box"><div class="ex-label">🤸 Exemple quotidien</div>Quand tu sautes, tu pousses le sol vers le bas, et le sol te pousse vers le haut avec la même force. C'est pour ça que tu t'élèves!</div>
<div class="us-box"><div class="us-label">🇺🇸 US 8th Grade Connection</div>En classe de Physical Science aux USA, on utilise F=ma pour tout! Exemple NASA: Falcon 9 (SpaceX) génère 7 607 000 N de poussée pour une masse de 549 054 kg → a = F/m ≈ 13,8 m/s². Vocabulaire clé: <em>inertia, net force, acceleration, velocity, momentum, thrust.</em></div>
<div class="experiment-box"><div class="exp-label">🔬 Expérience Maison (+50 XP)</div><strong>Matériel:</strong> Pièce de monnaie (100 FCFA), carte plastifiée, verre vide.<br/><strong>Protocole:</strong> Pose la carte sur le verre, la monnaie sur la carte. Frappe rapidement la carte horizontalement. La monnaie tombe DANS le verre!<br/><strong>Pourquoi?</strong> Inertie – la monnaie n'a pas eu le temps de suivre la carte.<br/><strong>Sécurité:</strong> Utilise un verre en plastique.</div>`,
    en:`<h3>🍎 Newton's Three Laws of Motion</h3>
<p>Isaac Newton (1643–1727) gave us three laws that govern ALL movement — from Douala's moto-taxis to NASA rockets. These are essential for every STEM career!</p>
<h4>1st Law – Inertia</h4>
<p>An object at rest stays at rest. An object in motion stays in motion at the same velocity, <strong>unless acted upon by a net external force</strong>.</p>
<div class="formula-box">∑F = 0 ↔ constant velocity (or rest)</div>
<div class="example-box"><div class="ex-label">🛵 Real-World Inertia</div>A moto-taxi riding at constant speed: engine force = friction force, so net force = 0, velocity stays constant. This is Newton's 1st Law!</div>
<h4>2nd Law – F = ma</h4>
<div class="formula-box">F = m × a (Force in Newtons)</div>
<div class="example-box"><div class="ex-label">🥭 Falling Mango</div>Mango: m = 0.3 kg, a = g = 10 m/s². Weight = 0.3 × 10 = <strong>3 N downward</strong>.</div>
<h4>3rd Law – Action & Reaction</h4>
<div class="formula-box">Every action has an equal and opposite reaction</div>
<div class="us-box"><div class="us-label">🇺🇸 US School Vocabulary</div>Key terms for your US Physical Science class: <strong>inertia, net force, acceleration, velocity, momentum, friction, gravity, mass vs weight.</strong><br/>SpaceX Falcon 9 uses F=ma for every launch calculation!</div>
<div class="experiment-box"><div class="exp-label">🔬 Home Experiment (+50 XP)</div><strong>Materials:</strong> A coin, a playing card, a glass.<br/><strong>Steps:</strong> Place card on glass, coin on card. Flick card away quickly. Coin drops INTO the glass — proof of inertia!<br/><strong>Science:</strong> The coin couldn't react fast enough to the horizontal force.</div>`
  },

  l_math_eq: {
    title:'Équations & Inéquations', titleEn:'Equations & Inequalities (US Algebra I)',
    tags:['Maths 2nde C','US Algebra I','L\'Excellence Maths'],
    quizKey:'q_math_eq',
    fr:`<h3>📐 Équations du 1er Degré</h3>
<p>Une équation du 1er degré a la forme <strong>ax + b = 0</strong>. L'objectif: isoler x.</p>
<div class="formula-box">ax + b = c → x = (c − b) / a</div>
<div class="example-box"><div class="ex-label">🛒 Marché de Mvog-Mbi</div>Amina achète 4 mangues et dépense 800 FCFA.<br/>Équation: 4x = 800 → x = <strong>200 FCFA</strong> la mangue.</div>
<h4>Équations du 2ème Degré</h4>
<div class="formula-box">ax² + bx + c = 0<br/>Δ = b² − 4ac<br/>x = (−b ± √Δ) / 2a</div>
<div class="example-box"><div class="ex-label">🏗️ Terrain à Yaoundé</div>Longueur (x+3) m, largeur x m, surface = 18 m²<br/>x(x+3) = 18 → x²+3x−18 = 0 → Δ = 81 → x = 3 m ✓</div>
<h4>Inéquations – Règle d'Or!</h4>
<p class="text-amber"><strong>⚠️ Si on multiplie/divise par un nombre NÉGATIF → le sens s'inverse!</strong></p>
<div class="formula-box">−2x > 6 → x < −3 (signe inversé!)</div>
<div class="us-box"><div class="us-label">🇺🇸 US Algebra I Bridge</div>Aux USA, cette matière s'appelle <strong>Algebra I</strong> (8th–9th grade). Vocabulaire clé: <em>variable, coefficient, like terms, distributive property, solution set, inequality, graphing on a number line.</em><br/>Exemple US: "A student earns $12/hr. She needs at least $150. How many hours?" → 12h ≥ 150 → h ≥ 12.5 → <strong>at least 13 hours.</strong></div>`,
    en:`<h3>📐 Equations & Inequalities</h3>
<p>Equations are the language of science. Every formula in physics, chemistry, and engineering is an equation. Mastering this = mastering STEM!</p>
<div class="formula-box">ax + b = c → x = (c − b) / a</div>
<div class="example-box"><div class="ex-label">🇺🇸 US Example</div>A babysitter earns $12/hour. She worked 'x' hours and earned $84. How many hours?<br/>12x = 84 → x = <strong>7 hours</strong>.</div>
<h4>Quadratic Equations</h4>
<div class="formula-box">ax² + bx + c = 0 → x = (−b ± √(b²−4ac)) / 2a</div>
<h4>Inequalities — IMPORTANT RULE!</h4>
<p><strong style="color:var(--rose)">⚠️ When multiplying or dividing by a NEGATIVE number → FLIP the sign!</strong></p>
<div class="formula-box">−2x > 6 → x < −3</div>
<div class="us-box"><div class="us-label">🇺🇸 Algebra I in Your Future US School</div>Key vocabulary: variable, coefficient, constant, solve for x, inequality, solution set, number line, substitution, elimination. You'll also graph inequalities on coordinate planes (x-y axis).</div>`
  },

  l_chem_atoms: {
    title:'Atomes & Molécules', titleEn:'Atoms & Molecules',
    tags:['Chimie 2nde C','US Physical Science'],
    quizKey:'q_chem_atoms',
    fr:`<h3>⚛️ L'Atome – Brique de l'Univers</h3>
<p>Tout ce qui existe – toi, l'air que tu respires, les mangues que tu manges – est composé d'atomes. La chimie commence ici!</p>
<ul><li><strong>Protons (+)</strong> : dans le noyau, définissent l'élément</li><li><strong>Neutrons (0)</strong> : dans le noyau, stabilisent</li><li><strong>Électrons (−)</strong> : autour du noyau, participent aux liaisons</li></ul>
<div class="formula-box">Z (numéro atomique) = nombre de protons = nombre d'e⁻<br/>A (masse atomique) = protons + neutrons</div>
<h4>Configuration Électronique</h4>
<p>Règle: couches K(max 2), L(max 8), M(max 18)...</p>
<div class="example-box"><div class="ex-label">🧂 Le sel de cuisine (NaCl)</div>Na (Z=11): config 2,8,1 → perd 1 e⁻ → Na⁺<br/>Cl (Z=17): config 2,8,7 → gagne 1 e⁻ → Cl⁻<br/>Na⁺ + Cl⁻ = NaCl (liaison ionique) = le sel dans ton ndolé!</div>
<div class="example-box"><div class="ex-label">💧 L'eau – H₂O</div>H (Z=1) partage son électron avec O (Z=8). Liaison covalente. 2H + O = H₂O. L'eau qu'on boit à Douala, c'est des millions de molécules H₂O!</div>
<div class="us-box"><div class="us-label">🇺🇸 US Chemistry Vocabulary</div><em>element, atom, molecule, compound, mixture, periodic table, atomic number, mass number, proton, neutron, electron, ionic bond, covalent bond, isotope, ion.</em><br/>Le tableau périodique a 118 éléments. En US school, tu DOIS le mémoriser partiellement!</div>
<div class="experiment-box"><div class="exp-label">🔬 Électrolyse de l'eau salée (+50 XP)</div><strong>Matériel:</strong> 2 piles AA, fil de cuivre, eau + sel, verre<br/><strong>Protocol:</strong> Dissous du sel dans l'eau. Relie les 2 fils aux pôles des piles, plonge dans l'eau. Des bulles apparaissent (O₂ et H₂)!<br/><strong>Sécurité:</strong> Utilise UNIQUEMENT des piles (max 3V). JAMAIS le réseau électrique!</div>`,
    en:`<h3>⚛️ Atoms & Molecules — Building Blocks of Everything</h3>
<p>Every single thing in the universe is made of atoms. Chemistry = the study of atoms and how they interact.</p>
<ul><li><strong>Protons (+)</strong> — in nucleus, define the element</li><li><strong>Neutrons</strong> — in nucleus, add stability</li><li><strong>Electrons (−)</strong> — orbit nucleus, form bonds</li></ul>
<div class="formula-box">Atomic Number (Z) = # protons = # electrons (neutral atom)<br/>Mass Number (A) = protons + neutrons</div>
<div class="example-box"><div class="ex-label">🧂 Table Salt — NaCl</div>Na (Z=11): config 2,8,1 → gives away 1 electron → Na⁺<br/>Cl (Z=17): config 2,8,7 → gains 1 electron → Cl⁻<br/>Ionic attraction: Na⁺ + Cl⁻ = NaCl ✓</div>
<div class="us-box"><div class="us-label">🇺🇸 Periodic Table in US Schools</div>You must know: element symbols (H, O, C, N, Na, Cl, Fe, Au...), atomic number, periodic trends. The table has 118 elements. Element 118 = Oganesson (Og), the newest synthetic element!</div>`
  },

  l_int_school: {
    title:'Système Scolaire US', titleEn:'US School System – Complete Guide',
    tags:['Intégration USA','Priorité','Prépare-toi!'],
    quizKey:'q_int_school',
    fr:`<h3>🎓 Comprendre l'École Américaine</h3>
<p>Le système éducatif américain est <strong>très différent</strong> du Cameroun. Voici tout ce que tu dois savoir avant d'arriver!</p>
<h4>Structure des Niveaux</h4>
<div class="example-box"><div class="ex-label">🏫 Niveaux Scolaires</div>
• <strong>Elementary School</strong>: Grades K–5 (5–11 ans) → Maternelle à CM2<br/>
• <strong>Middle School</strong>: Grades 6–8 (11–14 ans) → 6ème à 4ème<br/>
• <strong>High School</strong>: Grades 9–12 (14–18 ans) → 3ème à Terminale<br/>
• <strong>College/University</strong>: 4 ans après le lycée<br/><br/>
<strong>Toi à 13 ans avec niveau 2nde C</strong> → Tu entreras en <strong>8th ou 9th Grade</strong>!</div>
<h4>Système de Notes US</h4>
<div class="formula-box">A = 90–100% | B = 80–89% | C = 70–79% | D = 60–69% | F = Moins de 60%</div>
<div class="example-box"><div class="ex-label">🔄 Conversion de tes notes</div>
• 18/20 au Cameroun = 90% = A (Excellent!) 🌟<br/>
• 16/20 = 80% = B (Good)<br/>
• 14/20 = 70% = C (Satisfactory)<br/>
• 12/20 = 60% = D (Need improvement)<br/>
• Moins de 12/20 = F (Failing)</div>
<h4>Le GPA – Grade Point Average</h4>
<div class="formula-box">A=4.0 | B=3.0 | C=2.0 | D=1.0 | F=0.0</div>
<p>Les universités regardent ton GPA cumulé. Vise <strong>3.5+ GPA</strong> pour les meilleures universités. MIT, Harvard, Stanford exigent 3.9+!</p>
<h4>La Vie à l'École US – Très Différent!</h4>
<div class="example-box"><div class="ex-label">🆕 Ce qui change</div>
• Pas d'uniforme obligatoire (dans la plupart des écoles)<br/>
• Casier (locker) personnel pour tes affaires<br/>
• Tu changes de classe pour chaque matière<br/>
• Déjeuner à la cafétéria (cafeteria) – env. $2–5<br/>
• Bus scolaire (school bus) – souvent gratuit<br/>
• Clubs parascolaires très importants pour le CV universitaire<br/>
• Conseiller scolaire (counselor) – aide pour tout!<br/>
• SAT/ACT exams pour entrer à l'université (préparation dès maintenant!)</div>
<h4>Clubs & Activités – Très Importants!</h4>
<div class="us-box"><div class="us-label">🏆 Clubs Recommandés pour Toi</div>
• <strong>Science Club / Science Olympiad</strong> – pour les futures scientifiques<br/>
• <strong>Math Team / Math League</strong> – compétitions de maths<br/>
• <strong>Robotics Club / FIRST Robotics</strong> – très valorisé pour MIT/Stanford<br/>
• <strong>Debate Club</strong> – améliore ton anglais oral rapidement<br/>
• <strong>ESL Club</strong> – élèves qui apprennent l'anglais comme toi<br/>
• <strong>Student Council</strong> – développe le leadership<br/>
• <strong>African Student Association</strong> – si disponible dans ton école</div>`,
    en:`<h3>🎓 Your Complete US School Guide</h3>
<p>Welcome to the American education system! Here's everything you need to succeed starting from Day 1.</p>
<h4>Grade Structure</h4>
<div class="example-box"><div class="ex-label">🏫 School Levels</div>• Elementary: K–5 (ages 5–11)<br/>• Middle School: 6–8 (ages 11–14)<br/>• High School: 9–12 (ages 14–18)<br/>• At 13 with 2nde C level → you'll enter <strong>8th or 9th grade</strong>!</div>
<h4>Grading System</h4>
<div class="formula-box">A(90-100%) B(80-89%) C(70-79%) D(60-69%) F(&lt;60%)</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Advantage</div>Your bilingual (French + English) skills make you stand out! Colleges LOVE bilingual students. Also, your math level from Cameroon's 2nde C is ADVANCED compared to most US 8th graders. Use this to your advantage!</div>
<h4>Essential Day-1 Vocabulary</h4>
<div class="example-box"><div class="ex-label">🗣️ Must-Know Phrases</div>• "Excuse me, where is room 204?" – Pardon, où est la salle 204?<br/>• "May I use the restroom?" – Puis-je aller aux toilettes?<br/>• "Can you help me with my schedule?" – Pouvez-vous m'aider avec mon emploi du temps?<br/>• "I'm new here, from Cameroon." – Je suis nouvelle, je viens du Cameroun.<br/>• "What page are we on?" – On est à quelle page?<br/>• "I don't understand, can you repeat?" – Je ne comprends pas...</div>`
  },

  l_int_day1: {
    title:'1er Jour à l\'école US', titleEn:'Your First Day at a US School',
    tags:['Intégration USA','Priorité ABSOLUE'],
    quizKey:'q_int_day1',
    fr:`<h3>🏫 Ton Premier Jour – Tu Peux Le Faire!</h3>
<p>Le premier jour est stressant pour TOUT LE MONDE. Voici comment le réussir!</p>
<h4>La Veille (The Day Before)</h4>
<div class="example-box"><div class="ex-label">✅ Checklist Préparation</div>
• Prépare ton sac avec: cahiers, stylos, calculatrice, bouteille d'eau, snack<br/>
• Imprime ou enregistre ton "schedule" (emploi du temps)<br/>
• Mémorise le nom de ton "homeroom teacher" (prof principal)<br/>
• Sais-tu où se trouve ton casier (locker)?<br/>
• As-tu l'argent pour le déjeuner (lunch money)?<br/>
• Révise ces phrases clés en anglais!</div>
<h4>Le Matin – Arrivée</h4>
<div class="example-box"><div class="ex-label">🌅 Morning Routine US</div>
• Le bus scolaire (school bus) passe TRÈS tôt (souvent 6h30–7h30)<br/>
• Arrive 5–10 minutes avant le début<br/>
• Va directement à ton "homeroom" (salle principale)<br/>
• Présente-toi au prof: "Hi, I'm [nom]. I'm new. I'm from Cameroon."<br/>
• Le/la counselor te donnera un "buddy" (parrain/marraine) pour t'aider!</div>
<h4>Gérer la Journée</h4>
<div class="us-box"><div class="us-label">🇺🇸 Survival Tips</div>
• <strong>Schedule</strong>: tu changes de salle à chaque période (50 min en général)<br/>
• <strong>Hall pass</strong>: papier pour sortir de classe<br/>
• <strong>Cafeteria</strong>: tu choisis ta nourriture et tu payes (ou tu as droit à free lunch)<br/>
• <strong>Locker combination</strong>: code à 3 chiffres pour ton casier – mémorise-le!<br/>
• <strong>Fire drill</strong>: exercice d'évacuation – suis les autres, pas de panique<br/>
• <strong>Tardy</strong>: être en retard. 3 tardies = détention!</div>
<h4>Si Tu Te Sens Perdue</h4>
<div class="example-box"><div class="ex-label">🆘 Qui Contacter</div>
• <strong>Counselor office</strong>: ton allié numéro 1 – aide pour tout<br/>
• <strong>ESL Teacher</strong>: spécialisé pour élèves non-anglophones<br/>
• <strong>Security guard</strong>: peut t'indiquer les salles<br/>
• <strong>Any adult</strong>: "Excuse me, I need help finding my classroom"<br/>
• <strong>N'aie JAMAIS honte de demander de l'aide!</strong> C'est valorisé aux USA!</div>`,
    en:`<h3>🏫 Your First Day at a US School — You've Got This!</h3>
<div class="example-box"><div class="ex-label">✅ Day-1 Survival Kit</div>• Arrive 10 minutes early<br/>• Find your homeroom first<br/>• Introduce yourself: "Hi, I'm [name]. I'm new from Cameroon."<br/>• Ask for a buddy/guide from your counselor<br/>• Keep your schedule visible at all times<br/>• Don't worry about understanding everything — it takes time!</div>
<div class="us-box"><div class="us-label">🇺🇸 Key Vocabulary for Day 1</div><strong>homeroom</strong> = salle principale | <strong>schedule</strong> = emploi du temps | <strong>locker</strong> = casier | <strong>hall pass</strong> = autorisation de sortie | <strong>tardy</strong> = en retard | <strong>cafeteria</strong> = cantine | <strong>counselor</strong> = conseiller scolaire | <strong>period</strong> = cours (50 min) | <strong>buddy</strong> = camarade guide</div>
<div class="experiment-box"><div class="exp-label">🎯 Practice Challenge (+30 XP)</div>Practice these introductions out loud, 3 times each:<br/>1. "Hi! I'm [your name]. I'm from Cameroon. Nice to meet you!"<br/>2. "Excuse me, can you help me find room [number]?"<br/>3. "I don't understand. Could you say that again, slowly please?"</div>`
  },

  l_ela_gram: {
    title:'Grammar & Mechanics', titleEn:'English Grammar & Mechanics (US 8th Grade)',
    tags:['ELA','US 8th Grade','Bilingue'],
    quizKey:'q_ela_gram',
    fr:`<h3>✏️ Grammaire Anglaise Essentielle</h3>
<p>La grammaire anglaise est différente du français. Voici les règles les plus importantes!</p>
<h4>Les 8 Parties du Discours (Parts of Speech)</h4>
<div class="example-box"><div class="ex-label">📚 Parts of Speech</div>
• <strong>Noun</strong> (nom): person, place, thing → <em>Amina, Cameroon, mango</em><br/>
• <strong>Pronoun</strong> (pronom): I, you, he, she, it, we, they<br/>
• <strong>Verb</strong> (verbe): action/state → <em>run, study, is, become</em><br/>
• <strong>Adjective</strong> (adjectif): describes noun → <em>smart, beautiful, African</em><br/>
• <strong>Adverb</strong> (adverbe): modifies verb → <em>quickly, very, always</em><br/>
• <strong>Preposition</strong> (préposition): in, on, at, by, with, to<br/>
• <strong>Conjunction</strong> (conjonction): and, but, or, because, although<br/>
• <strong>Interjection</strong>: Wow! Ouch! Hey!</div>
<h4>Temps Verbaux Essentiels</h4>
<div class="formula-box">Simple Present: I study / She studies<br/>Simple Past: I studied / She studied<br/>Future: I will study / I am going to study<br/>Present Perfect: I have studied</div>
<div class="example-box"><div class="ex-label">🔑 Différences FR → EN</div>
• En anglais: PAS d'accord sujet-adjectif: <em>beautiful girls</em> (pas "beautifuls")<br/>
• Majuscule aux nationalités: African, French, American, Cameroonian<br/>
• Majuscule aux langues: I speak French and English.<br/>
• "I" toujours majuscule: not "i like..." → "I like..."<br/>
• Virgule obligatoire avant "but", "and" dans listes de 3+</div>
<div class="us-box"><div class="us-label">🇺🇸 Common Mistakes French Speakers Make</div>
• ❌ "I am agree" → ✅ "I agree" (agree = déjà un verbe, pas "être d'accord")<br/>
• ❌ "She is 13 years" → ✅ "She is 13 years old"<br/>
• ❌ "I have 13 years" → ✅ "I am 13 years old"<br/>
• ❌ "It depends of" → ✅ "It depends on"<br/>
• ❌ "He don't know" → ✅ "He doesn't know"<br/>
• ❌ "Informations" → ✅ "Information" (uncountable!)</div>`,
    en:`<h3>✏️ Grammar & Mechanics — US 8th Grade ELA</h3>
<p>Grammar is the foundation of clear communication. In US schools, grammar is tested in writing assignments, standardized tests (SAT), and everyday communication.</p>
<h4>The 8 Parts of Speech</h4>
<div class="formula-box">Noun | Pronoun | Verb | Adjective | Adverb | Preposition | Conjunction | Interjection</div>
<div class="example-box"><div class="ex-label">📝 Sentence Structure</div>A complete sentence needs: <strong>Subject + Verb</strong> (at minimum).<br/>• Simple: "Amina studies." ✓<br/>• Compound: "Amina studies hard, and she earns good grades."<br/>• Complex: "Although it is difficult, Amina always perseveres."</div>
<div class="us-box"><div class="us-label">🇺🇸 Standardized Test Tip</div>The SAT, ACT, and state tests heavily test grammar. Start practicing now! Focus on: subject-verb agreement, pronoun-antecedent agreement, comma rules, apostrophes, and parallel structure.</div>`
  },

  l_civics_immigr: {
    title:'Immigration & Citoyenneté', titleEn:'Immigration & US Citizenship',
    tags:['Civics','Intégration USA','Droit Américain'],
    quizKey:'q_civics',
    fr:`<h3>🗽 L'Immigration aux USA – Ce que Tu Dois Savoir</h3>
<p>En tant que future résidente aux USA, comprendre le système d'immigration est essentiel pour toi et ta famille!</p>
<h4>Types de Visas et Statuts</h4>
<div class="example-box"><div class="ex-label">📋 Statuts Principaux</div>
• <strong>Visa F-1</strong>: Étudiant(e) – pour études longues durée<br/>
• <strong>Visa J-1</strong>: Échange scolaire/culturel<br/>
• <strong>Green Card</strong> (Permanent Resident): droit de vivre et travailler indéfiniment<br/>
• <strong>Citoyen(ne) naturalisé(e)</strong>: après 5 ans de Green Card + test<br/>
• <strong>DACA</strong>: protection pour certains jeunes arrivés enfants<br/>
• <strong>Refugee / Asylum</strong>: protection internationale</div>
<h4>Tes Droits en Tant qu'Élève</h4>
<div class="us-box"><div class="us-label">⚖️ Droit à l'Éducation (Plyler v. Doe, 1982)</div>Aux USA, <strong>TOUT enfant a droit à l'éducation publique gratuite</strong>, quel que soit son statut migratoire. C'est un droit constitutionnel! Aucune école ne peut te refuser l'inscription à cause de ton statut.<br/><br/>Si quelqu'un essaie de te refuser l'accès à l'école, contacte immédiatement:<br/>• Le district scolaire (school district office)<br/>• L'ACLU (American Civil Liberties Union) – gratuit<br/>• Un avocat spécialisé en immigration</div>
<h4>La Citoyenneté Américaine – Processus</h4>
<div class="example-box"><div class="ex-label">🗽 Devenir Citoyenne</div>
1. Obtenir un statut légal (visa, Green Card...)<br/>
2. Résider légalement 5 ans (3 ans si marié à citoyen US)<br/>
3. Passer le test de citoyenneté (100 questions sur l'histoire et civisme US)<br/>
4. Passer le test d'anglais<br/>
5. Cérémonie de naturalisation → Citoyenne américaine! 🇺🇸<br/><br/>
<strong>Bonne nouvelle:</strong> Les mineurs qui obtiennent le statut via leurs parents deviennent souvent automatiquement citoyens!</div>
<h4>Ressources Importantes</h4>
<div class="experiment-box"><div class="exp-label">📞 Contacts Utiles (+20 XP: mémorise ces ressources)</div>
• <strong>USCIS</strong> (uscis.gov): agence fédérale d'immigration<br/>
• <strong>UNHCR</strong>: aide aux réfugiés<br/>
• <strong>International Rescue Committee</strong> (rescue.org): aide à l'installation<br/>
• <strong>211</strong>: numéro pour toute aide sociale aux USA<br/>
• <strong>ACLU</strong> (aclu.org): défense des droits civiques</div>`,
    en:`<h3>🗽 Immigration & US Citizenship</h3>
<p>Understanding immigration law is POWER. Here's what every immigrant student needs to know.</p>
<h4>Your Constitutional Right to Education</h4>
<div class="us-box"><div class="us-label">⚖️ Plyler v. Doe (1982)</div>The US Supreme Court ruled that ALL children have the right to free public education regardless of immigration status. No school can deny you enrollment. This is your right!</div>
<div class="example-box"><div class="ex-label">🗽 Path to Citizenship</div>1. Legal status (visa, green card) → 2. Legal residence 5 years → 3. Civics test (100 questions) → 4. English test → 5. Oath ceremony → 🇺🇸 US Citizen!</div>`
  },

  l_fin_money: {
    title:'L\'Argent aux USA', titleEn:'Understanding Money in the US',
    tags:['Financial Literacy','Vie aux USA','Pratique'],
    quizKey:'q_finance',
    fr:`<h3>💰 Le Système Monétaire Américain</h3>
<p>Arriver aux USA avec une bonne compréhension de l'argent te donnera un énorme avantage!</p>
<h4>La Monnaie US – Le Dollar</h4>
<div class="example-box"><div class="ex-label">💵 Billets et Pièces</div>
• <strong>Billets</strong>: $1, $5, $10, $20, $50, $100<br/>
• <strong>Pièces</strong>: Penny (1¢), Nickel (5¢), Dime (10¢), Quarter (25¢)<br/>
• <strong>Taux approximatif</strong>: 1 USD ≈ 600 FCFA (varie selon le marché)<br/>
• <strong>$1 = 100 cents</strong><br/>
• En France/Cameroun vous utilisez des virgules: 2,50€. Aux USA: <strong>2.50$</strong> (point, pas virgule!)</div>
<h4>Coûts de Vie aux USA</h4>
<div class="example-box"><div class="ex-label">💸 Dépenses Typiques</div>
• Déjeuner à l'école: $2–5 (ou gratuit si revenus faibles → Free/Reduced Lunch)<br/>
• Transport bus: souvent gratuit pour les élèves<br/>
• Fournitures scolaires: ~$30–50 par an<br/>
• Vêtements: $15–40 par article (attend les soldes = sales!)<br/>
• Smartphone plan: $15–35/mois (plans familiaux moins chers)<br/>
• Netflix/streaming: $7–18/mois</div>
<h4>Comment Économiser aux USA</h4>
<div class="us-box"><div class="us-label">💡 Astuces d'Économies</div>
• <strong>Thrift stores</strong> (friperies): vêtements de qualité à 90% moins cher<br/>
• <strong>Coupons & Sales</strong>: toujours chercher des réductions<br/>
• <strong>SNAP benefits</strong>: aide alimentaire pour familles à faibles revenus<br/>
• <strong>Library card</strong>: gratuite, donne accès à livres, films, internet<br/>
• <strong>Free lunch program</strong>: si famille éligible – INSCRIS-TOI!<br/>
• <strong>Scholarships</strong>: commence à les chercher DÈS maintenant!<br/>
• <strong>529 Plan</strong>: épargne universitaire défiscalisée</div>
<h4>Ton Premier Compte Bancaire</h4>
<div class="experiment-box"><div class="exp-label">🏦 Ouvrir un Compte (+40 XP)</div>
<strong>Documents nécessaires:</strong> Passeport, preuve d'adresse, ITIN ou SSN si disponible<br/>
<strong>Banques recommandées pour immigrants:</strong><br/>
• Chime (pas de minimum, pas de frais)<br/>
• Bank of America (présente partout)<br/>
• Credit Unions locales (meilleures conditions souvent)<br/>
<strong>Vocabulaire bancaire:</strong> checking account (compte courant), savings account (épargne), debit card (carte de débit), ATM (distributeur), direct deposit, routing number</div>`,
    en:`<h3>💰 Money in the US — Financial Literacy</h3>
<p>Financial literacy is one of the most practical skills for US life. Understanding money = freedom!</p>
<div class="example-box"><div class="ex-label">💵 US Currency</div>• Bills: $1, $5, $10, $20, $50, $100<br/>• Coins: Penny (1¢), Nickel (5¢), Dime (10¢), Quarter (25¢)<br/>• Prices use decimals: $2.50 (NOT $2,50)<br/>• Tax is added AT THE REGISTER (price tags don't include tax!)</div>
<div class="us-box"><div class="us-label">🎓 Scholarships — Start Now!</div>Many scholarships exist specifically for immigrant students, African students, and STEM girls! Start building your portfolio now: good grades, STEM clubs, community service, and essays. Websites: scholarships.com, fastweb.com, collegeboard.org</div>`
  },

  l_health_mental: {
    title:'Santé Mentale & Bien-être', titleEn:'Mental Health & Wellness',
    tags:['Santé','Bien-être','Transition USA'],
    quizKey:'q_health',
    fr:`<h3>🧠 Prendre Soin de Ta Santé Mentale</h3>
<p>Immigrer dans un nouveau pays est <strong>difficile émotionnellement</strong>. C'est NORMAL de ressentir stress, nostalgie, et anxiété. Voici comment gérer.</p>
<h4>Le Choc Culturel – C'est Normal!</h4>
<div class="example-box"><div class="ex-label">🌊 Les 4 Phases du Choc Culturel</div>
1. <strong>Lune de miel</strong>: "Wow, tout est nouveau et excitant!"<br/>
2. <strong>Frustration</strong>: "Pourquoi tout est différent? Je me sens seule."<br/>
3. <strong>Adaptation</strong>: "Je commence à comprendre les codes."<br/>
4. <strong>Intégration</strong>: "Je me sens chez moi ici ET au Cameroun."<br/><br/>
<strong>La plupart des immigrants passent entre 6 mois et 2 ans à traverser ces phases. Tu es normale!</strong></div>
<h4>Stratégies pour le Bien-être</h4>
<div class="example-box"><div class="ex-label">💚 Ce qui Aide</div>
• <strong>Garde le contact</strong> avec ta famille et amis au Cameroun (WhatsApp, appels vidéo)<br/>
• <strong>Trouve une communauté</strong> africaine ou camerounaise dans ta ville<br/>
• <strong>Maintiens tes rituels</strong>: cuisine camerounaise, musique afrobeat, prières<br/>
• <strong>Journaling</strong>: écris tes émotions chaque soir (en FR ou EN)<br/>
• <strong>Exercice physique</strong>: 30 min de marche = meilleur antidépresseur naturel<br/>
• <strong>Parle à ton counselor</strong>: c'est confidentiel et gratuit à l'école!<br/>
• <strong>ARIA ta tutrice IA</strong> est toujours disponible pour parler!</div>
<h4>Ressources de Soutien</h4>
<div class="us-box"><div class="us-label">🆘 Si Tu Te Sens Très Seule ou Triste</div>
• <strong>988 Suicide & Crisis Lifeline</strong>: appelle ou texte 988 (gratuit, 24h/24)<br/>
• <strong>Crisis Text Line</strong>: texte "HELLO" au 741741<br/>
• <strong>School counselor</strong>: gratuit, confidentiel, accessible<br/>
• <strong>SAMHSA Helpline</strong>: 1-800-662-4357<br/><br/>
<strong>⚠️ Demander de l'aide est un SIGNE DE FORCE, pas de faiblesse!</strong></div>`,
    en:`<h3>🧠 Mental Health & Wellness</h3>
<p>Moving to a new country is emotionally challenging. Feeling stressed, homesick, or anxious is completely NORMAL. Here's how to take care of your mental health.</p>
<h4>Cultural Shock is Real</h4>
<div class="example-box"><div class="ex-label">🌊 The 4 Stages of Culture Shock</div>1. Honeymoon phase — everything is exciting<br/>2. Frustration — why is everything so different?<br/>3. Adjustment — starting to understand the new culture<br/>4. Integration — feeling at home in BOTH cultures</div>
<div class="us-box"><div class="us-label">🆘 Crisis Resources</div>• Call/text <strong>988</strong> (Suicide & Crisis Lifeline) — free, 24/7<br/>• Text "HELLO" to <strong>741741</strong> (Crisis Text Line)<br/>• Your school counselor — free, confidential<br/>• <strong>Asking for help is STRENGTH, not weakness!</strong></div>`
  },

  l_sci_evol: {
    title:'Évolution & Sélection Naturelle', titleEn:'Evolution & Natural Selection',
    tags:['Life Science','US 8th Grade','Darwin'],
    quizKey:'q_evolution',
    fr:`<h3>🦋 La Théorie de l'Évolution</h3>
<p>Charles Darwin (1809–1882) a proposé que toutes les espèces vivantes ont évolué à partir d'ancêtres communs par <strong>sélection naturelle</strong>.</p>
<h4>Les 4 Principes de Darwin</h4>
<div class="example-box"><div class="ex-label">🧬 Comment Ça Marche</div>
1. <strong>Variation</strong>: Les individus d'une espèce sont différents (taille, couleur, résistance...)<br/>
2. <strong>Hérédité</strong>: Les traits se transmettent aux descendants<br/>
3. <strong>Sélection</strong>: Les individus les mieux adaptés survivent et se reproduisent plus<br/>
4. <strong>Temps</strong>: Sur des millions d'années, accumulation de changements = nouvelle espèce!</div>
<div class="example-box"><div class="ex-label">🦎 Exemple: Caméléons du Cameroun</div>Le Cameroun abrite de nombreuses espèces de caméléons! Ceux dont la couleur se camouflait mieux ont survécu aux prédateurs. Ceux qui se faisaient voir étaient mangés. Après des générations → caméléons experts en camouflage. C'est la sélection naturelle!</div>
<div class="us-box"><div class="us-label">🇺🇸 US 8th Grade Science</div>L'évolution est une des théories les plus testées et confirmées de toute la science. En classe US, tu étudieras: fossiles, anatomie comparée, ADN comparatif, résistance aux antibiotiques (évolution en temps réel!). Vocabulaire clé: <em>natural selection, adaptation, mutation, speciation, fossil record, common ancestor.</em></div>`,
    en:`<h3>🦋 Evolution & Natural Selection</h3>
<p>Darwin's theory of evolution is one of the most powerful and well-tested ideas in all of science. Understanding it is essential for biology, medicine, and environmental science.</p>
<div class="formula-box">Variation + Heredity + Selection + Time = Evolution</div>
<div class="example-box"><div class="ex-label">🦠 Evolution Right Now</div>Bacteria evolving antibiotic resistance is evolution happening in real-time! This is why we need new antibiotics constantly, and why you should ALWAYS finish your full antibiotic course.</div>
<div class="us-box"><div class="us-label">🇺🇸 Vocabulary for US Class</div><strong>natural selection, adaptation, mutation, genetic variation, speciation, common ancestor, fossil record, homologous structures, biogeography, coevolution.</strong></div>`
  },
  // ══ MATHEMATICS ══
  l_math_logic: {
    title:'Logique & Ensembles', titleEn:'Logic & Sets',
    tags:['Maths 2nde C','US Pre-Algebra'], quizKey:'q_math_logic',
    fr:`<h3>🧠 Logique Mathématique & Théorie des Ensembles</h3>
<p>La logique est la base du raisonnement mathématique. Un <strong>ensemble</strong> est une collection d'éléments bien définis.</p>
<h4>Ensembles et Opérations</h4>
<div class="formula-box">A ∪ B = union (A ou B) | A ∩ B = intersection (A et B) | Ā = complémentaire de A</div>
<div class="example-box"><div class="ex-label">🏫 Élèves 2nde C</div>A = {élèves qui aiment les maths} = {Amina, Kemi, Paul}<br/>B = {élèves qui aiment la physique} = {Amina, Ngo, Paul}<br/>A ∩ B = {Amina, Paul} ← aiment les DEUX<br/>A ∪ B = {Amina, Kemi, Paul, Ngo} ← aiment l'un OU l'autre</div>
<h4>Propositions Logiques</h4>
<div class="formula-box">P ⟹ Q : "Si P alors Q" | P ⟺ Q : "P équivaut à Q" | ¬P : "Non P"</div>
<div class="example-box"><div class="ex-label">✅ Exemple de Raisonnement</div>"Si une figure a 4 côtés égaux (P) alors c'est un losange (Q)" = P⟹Q<br/>La contraposée: "Si ce n'est pas un losange alors ses côtés ne sont pas tous égaux" = ¬Q⟹¬P</div>
<h4>Quantificateurs</h4>
<div class="formula-box">∀ = "Pour tout" | ∃ = "Il existe"</div>
<div class="us-box"><div class="us-label">🇺🇸 US Connection</div>Set theory appears in US Pre-Algebra and Algebra I. In Computer Science (which you'll study!), logic gates (AND, OR, NOT) are the foundation of all computers. Every program ever written uses Boolean logic: <strong>if/else, AND, OR, NOT</strong>.</div>`,
    en:`<h3>🧠 Logic & Set Theory</h3>
<p>Logic is the language of mathematics and computer science. A <strong>set</strong> is any well-defined collection of objects.</p>
<div class="formula-box">Union (A∪B) | Intersection (A∩B) | Complement (Ā) | Subset (A⊂B)</div>
<div class="example-box"><div class="ex-label">💻 CS Connection</div>Venn diagrams are used everywhere: database queries (SQL uses AND/OR/NOT), search engines ("cats AND dogs NOT fish"), and all programming logic.</div>
<div class="us-box"><div class="us-label">🇺🇸 US Class Key Vocabulary</div><strong>element, set, union, intersection, complement, subset, Venn diagram, logical statement, hypothesis, conclusion, contrapositive, biconditional.</strong></div>`
  },
  l_math_reels: {
    title:'Nombres Réels & Intervalles', titleEn:'Real Numbers & Intervals',
    tags:['Maths 2nde C'], quizKey:'q_math_reels',
    fr:`<h3>🔢 Les Ensembles de Nombres</h3>
<p>Les nombres s'organisent en ensembles emboîtés : <strong>ℕ ⊂ ℤ ⊂ ℚ ⊂ ℝ</strong></p>
<div class="example-box"><div class="ex-label">📊 Hiérarchie des nombres</div>• ℕ = {0, 1, 2, 3, ...} (Naturels)<br/>• ℤ = {..., -2, -1, 0, 1, 2, ...} (Relatifs/Integers)<br/>• ℚ = {p/q, p∈ℤ, q∈ℕ*} (Rationnels — fractions)<br/>• ℝ = ℚ + irrationnels comme π, √2 (Réels)</div>
<h4>Valeur Absolue</h4>
<div class="formula-box">|x| = x si x ≥ 0 | |x| = −x si x &lt; 0 | |x| = distance à 0</div>
<div class="example-box"><div class="ex-label">🌡️ Températures à Yaoundé</div>|−3°C| = 3 (distance à 0 sur le thermomètre). Ordre sur la droite réelle: −5 &lt; −2 &lt; 0 &lt; 3 &lt; 7</div>
<h4>Intervalles</h4>
<div class="formula-box">[a, b] fermé | ]a, b[ ouvert | [a, +∞[ demi-ouvert</div>
<div class="us-box"><div class="us-label">🇺🇸 US Notation</div>In US textbooks: (a, b) = ]a, b[ open interval. [a, b] = closed interval. Number line and interval notation are fundamental for US Algebra I, Pre-Calculus, and the SAT. Key vocab: <strong>integer, rational, irrational, absolute value, number line, interval, inequality solution set.</strong></div>`,
    en:`<h3>🔢 Real Numbers & Absolute Value</h3>
<p>Every number you'll use in math is a Real Number. Understanding their properties is essential for Algebra.</p>
<div class="formula-box">ℕ⊂ℤ⊂ℚ⊂ℝ | Absolute Value: |x| = distance from 0</div>
<div class="us-box"><div class="us-label">🇺🇸 US Class Vocabulary</div><strong>natural number, integer, rational, irrational, real number, absolute value, number line, interval notation, open/closed interval, inequality.</strong><br/>π ≈ 3.14159... and √2 ≈ 1.414... are irrational — their decimals never repeat!</div>`
  },
  l_math_func: {
    title:'Fonctions Numériques', titleEn:'Functions & Graphs',
    tags:['Maths 2nde C','US Algebra I'], quizKey:'q_math_func',
    fr:`<h3>📈 Les Fonctions Numériques</h3>
<p>Une <strong>fonction</strong> associe à chaque valeur x une valeur unique f(x). C'est l'outil central de toutes les mathématiques!</p>
<div class="formula-box">f : x ↦ f(x) | Domaine Df | Image f(x) | Antécédent de y = x tel que f(x)=y</div>
<h4>Fonctions Affines : f(x) = ax + b</h4>
<div class="example-box"><div class="ex-label">🛵 Tarif Moto-taxi Yaoundé</div>Coût = 200 + 50×(km) → f(km) = 50km + 200<br/>• a = 50 (pente = prix par km)<br/>• b = 200 (ordonnée à l'origine = prix de base)<br/>Pour 3 km: f(3) = 50×3 + 200 = <strong>350 FCFA</strong></div>
<h4>Tableau de Variations</h4>
<p>Si a > 0 : fonction croissante. Si a < 0 : décroissante.</p>
<h4>Fonctions du 2nd degré : f(x) = ax² + bx + c</h4>
<div class="formula-box">Parabole | Sommet: xs = −b/(2a) | f(xs) = valeur min ou max</div>
<div class="us-box"><div class="us-label">🇺🇸 US Algebra I & Pre-Calc</div>Functions are everywhere in US math: f(x) notation, domain, range, graphing on the coordinate plane. Key vocab: <strong>function, f(x) notation, domain, range, slope, y-intercept, linear function, quadratic, parabola, vertex, axis of symmetry, increasing/decreasing.</strong></div>`,
    en:`<h3>📈 Functions & Graphs</h3>
<div class="formula-box">Function: each input x has exactly ONE output f(x)</div>
<div class="example-box"><div class="ex-label">🇺🇸 Slope Formula</div>Slope m = (y₂−y₁)/(x₂−x₁) = rise/run. Key for US Algebra I! If slope = 3: for every 1 unit right, go 3 units up.</div>
<div class="us-box"><div class="us-label">🇺🇸 US Class Key Terms</div><strong>function, domain, range, f(x) notation, slope, y-intercept, slope-intercept form (y=mx+b), standard form, point-slope form, quadratic function, parabola, vertex, axis of symmetry.</strong></div>`
  },
  l_math_trigo: {
    title:'Trigonométrie', titleEn:'Trigonometry (SOHCAHTOA)',
    tags:['Maths 2nde C','US Geometry'], quizKey:'q_math_trigo',
    fr:`<h3>📐 Trigonométrie — Angles et Triangles</h3>
<p>La trigonométrie est l'étude des relations entre angles et longueurs dans les triangles. Essentielle pour la physique, l'ingénierie, et l'astronomie!</p>
<h4>Dans un Triangle Rectangle</h4>
<div class="formula-box">sin(θ) = Opposé/Hypoténuse | cos(θ) = Adjacent/Hypoténuse | tan(θ) = Opposé/Adjacent</div>
<div class="example-box"><div class="ex-label">🏔️ Hauteur du Mont Cameroun</div>Si tu mesures un angle de 30° vers le sommet à 10 km de la base:<br/>hauteur = 10 000 × tan(30°) = 10 000 × 0,577 ≈ <strong>5 770 m</strong><br/>(Le vrai Mont Cameroun = 4 070 m — belle approximation!)</div>
<h4>Valeurs Remarquables</h4>
<div class="formula-box">θ: 0° | 30° | 45° | 60° | 90°<br/>sin: 0 | 1/2 | √2/2 | √3/2 | 1<br/>cos: 1 | √3/2 | √2/2 | 1/2 | 0</div>
<h4>Identité Fondamentale</h4>
<div class="formula-box">sin²(θ) + cos²(θ) = 1 (TOUJOURS vraie!)</div>
<div class="us-box"><div class="us-label">🇺🇸 Moyen Mnémotechnique US: SOHCAHTOA</div><strong>SOH</strong>: Sine = Opposite/Hypotenuse<br/><strong>CAH</strong>: Cosine = Adjacent/Hypotenuse<br/><strong>TOA</strong>: Tangent = Opposite/Adjacent<br/>Every US Geometry and Pre-Calc student uses this! Memorize it.</div>`,
    en:`<h3>📐 Trigonometry — SOHCAHTOA</h3>
<div class="formula-box">SOH: sin=Opp/Hyp | CAH: cos=Adj/Hyp | TOA: tan=Opp/Adj</div>
<div class="example-box"><div class="ex-label">🌟 Pythagorean Identity</div>sin²(θ) + cos²(θ) = 1 is always true for any angle! This identity is used throughout calculus, physics, and engineering.</div>
<div class="us-box"><div class="us-label">🇺🇸 US Vocabulary</div><strong>right triangle, hypotenuse, opposite, adjacent, angle, sine, cosine, tangent, SOHCAHTOA, Pythagorean theorem, inverse trig (arcsin, arccos, arctan), unit circle.</strong></div>`
  },
  l_math_vect: {
    title:'Vecteurs', titleEn:'Vectors',
    tags:['Maths 2nde C','US Pre-Calc','Physics'], quizKey:'q_math_vect',
    fr:`<h3>➡️ Les Vecteurs</h3>
<p>Un <strong>vecteur</strong> représente une quantité ayant à la fois une <strong>direction</strong>, un <strong>sens</strong> et une <strong>norme</strong> (longueur). Les forces en physique sont des vecteurs!</p>
<div class="formula-box">AB⃗ = (xB−xA ; yB−yA) | Norme: ||AB⃗|| = √((xB−xA)²+(yB−yA)²)</div>
<h4>Opérations sur les Vecteurs</h4>
<div class="example-box"><div class="ex-label">🗺️ Déplacement à Yaoundé</div>Amina part du Centre Commercial Mvog-Mbi A(2, 1) vers la gare B(5, 4):<br/>AB⃗ = (5−2 ; 4−1) = (3 ; 3)<br/>Distance = √(3²+3²) = √18 ≈ <strong>4.24 km</strong> (en ligne droite)</div>
<h4>Addition de Vecteurs (Règle de Chasles)</h4>
<div class="formula-box">AB⃗ + BC⃗ = AC⃗ (règle de Chasles)</div>
<div class="formula-box">k×u⃗ = (k×ux ; k×uy) — multiplication scalaire</div>
<div class="us-box"><div class="us-label">🇺🇸 Vectors in US Physics & Math</div>In US 8th grade Science, vectors represent: force, velocity, acceleration, displacement. Key vocab: <strong>vector, scalar, magnitude, direction, resultant, component, x-component, y-component, coordinate system, unit vector.</strong><br/>Tip: "Velocity" in US class is always a vector (speed + direction)!</div>`,
    en:`<h3>➡️ Vectors — Direction + Magnitude</h3>
<div class="formula-box">Vector AB⃗ = (Δx, Δy) | Magnitude: √(Δx²+Δy²)</div>
<div class="us-box"><div class="us-label">🇺🇸 Physics Vectors</div>Every force in physics is a vector! Net force = sum of all force vectors. If forces cancel (equal and opposite), acceleration = 0. This is Newton's 1st Law in vector form: ΣF⃗ = 0⃗ ↔ constant velocity.</div>`
  },
  l_math_stats: {
    title:'Statistiques & Probabilités', titleEn:'Statistics & Probability',
    tags:['Maths 2nde C','US Data Science'], quizKey:'q_math_stats',
    fr:`<h3>📊 Statistiques Descriptives</h3>
<p>Les statistiques permettent d'analyser des données pour en extraire des informations. C'est la base de la science des données et de l'IA!</p>
<h4>Mesures de Tendance Centrale</h4>
<div class="formula-box">Moyenne: x̄ = Σxᵢ/n | Médiane: valeur centrale | Mode: valeur la plus fréquente</div>
<div class="example-box"><div class="ex-label">🥭 Prix des Mangues au Marché</div>Prix (FCFA): 150, 200, 200, 250, 300, 300, 300, 400<br/>• Moyenne: (150+200+200+250+300+300+300+400)/8 = <strong>262,5 FCFA</strong><br/>• Médiane: (250+300)/2 = <strong>275 FCFA</strong><br/>• Mode: <strong>300 FCFA</strong> (3 fois)</div>
<h4>Dispersion</h4>
<div class="formula-box">Variance: σ² = Σ(xᵢ−x̄)²/n | Écart-type: σ = √σ²</div>
<h4>Probabilités de Base</h4>
<div class="formula-box">P(A) = Nombre de cas favorables / Nombre total de cas</div>
<div class="us-box"><div class="us-label">🇺🇸 US Statistics (8th Grade & SAT)</div>US class covers: mean, median, mode, range, box plots, quartiles (Q1, Q3), IQR = Q3−Q1, scatter plots, line of best fit (trend line), correlation vs causation. Key vocab: <strong>mean, median, mode, range, outlier, quartile, interquartile range, histogram, scatterplot, correlation.</strong></div>`,
    en:`<h3>📊 Statistics & Probability</h3>
<div class="formula-box">Mean = Σx/n | Median = middle value | Mode = most frequent | Range = max−min</div>
<div class="example-box"><div class="ex-label">📦 Box Plot (US Favorite!)</div>A box plot shows: Min | Q1 | Median | Q3 | Max. The "box" covers Q1 to Q3 = middle 50% of data. Outliers are shown as separate dots.</div>
<div class="us-box"><div class="us-label">🇺🇸 Data Science Connection</div>Statistics is the foundation of Data Science, Machine Learning, and AI — all high-paying STEM careers! If you master stats, you can analyze climate data, medical trials, social media trends, and economic patterns.</div>`
  },
  l_math_us: {
    title:'Pont vers l\'Algèbre US', titleEn:'US Algebra I Bridge',
    tags:['US Algebra I','SAT Prep','8th Grade'], quizKey:'q_math_us',
    fr:`<h3>🌉 Pont Maths Cameroun → USA</h3>
<p>Tes maths de 2nde C sont TRÈS avancées par rapport au programme US. Voici les points de connexion clés!</p>
<h4>Systèmes d'Équations (US: Systems of Equations)</h4>
<div class="formula-box">Méthode de substitution | Méthode d'addition (élimination)</div>
<div class="example-box"><div class="ex-label">💰 Problème Type SAT</div>"A store sells notebooks for $3 and pens for $1.50. If you buy 8 items and spend $18, how many of each?"<br/>x + y = 8 et 3x + 1.5y = 18 → x=4 cahiers, y=4 stylos ✓</div>
<h4>Factorisation (US: Factoring)</h4>
<div class="formula-box">a²−b² = (a−b)(a+b) | (a+b)² = a²+2ab+b² | a(b+c) = ab+ac</div>
<h4>Ce que les Américains appellent différemment</h4>
<div class="example-box"><div class="ex-label">📖 Vocabulaire Bilingue Maths</div>• Trinôme du 2nd degré = Quadratic Expression<br/>• Racine = Root/Zero/Solution<br/>• Résoudre = Solve<br/>• Factoriser = Factor<br/>• Développer = Expand/Distribute<br/>• Droite = Line (pas "straight line", juste "line")<br/>• Pente = Slope</div>
<div class="us-box"><div class="us-label">🇺🇸 SAT Math Tips</div>SAT Math covers Algebra, Problem-Solving, and Data Analysis. Your Cameroon 2nde C math is AHEAD of the SAT. Focus on: reading US math vocabulary in English, learning US notation, and practicing under timed conditions. Khan Academy SAT prep is 100% FREE!</div>`,
    en:`<h3>🌉 US Algebra I — You're Already Ahead!</h3>
<p>Your Cameroon math level is ADVANCED compared to US 8th grade. Here's how to use that advantage!</p>
<div class="example-box"><div class="ex-label">🏆 Your Advantages</div>• You know the quadratic formula (US students learn it in 9th grade!)<br/>• You can do complex algebraic manipulation<br/>• Trigonometry basics (most US 8th graders haven't seen this)<br/>• Statistics with variance (US: mostly mean/median/mode at this level)</div>
<div class="us-box"><div class="us-label">🇺🇸 Key Differences to Master</div>1. US uses "PEMDAS" for order of operations (not PEMDAS in FR)<br/>2. Decimal point vs comma: $3.50 (not $3,50)<br/>3. Fractions are often kept as fractions, not converted<br/>4. "Check your work" by substituting answer back</div>`
  },

  // ══ PHYSICS ══
  l_phys_cin: {
    title:'Cinématique', titleEn:'Kinematics — Motion',
    tags:['Physique 2nde C','US Physical Science'], quizKey:'q_phys_cin',
    fr:`<h3>🏃 La Cinématique — Étude du Mouvement</h3>
<p>La cinématique décrit le <strong>comment</strong> du mouvement (sans les causes = forces). Indispensable pour comprendre tout objet en déplacement!</p>
<h4>Position, Vitesse, Accélération</h4>
<div class="formula-box">Vitesse moyenne: v = Δd/Δt (m/s) | Accélération: a = Δv/Δt (m/s²)</div>
<div class="example-box"><div class="ex-label">🛵 Moto-taxi Yaoundé→Douala</div>Distance: 240 km | Durée: 3 heures<br/>Vitesse moyenne: v = 240/3 = <strong>80 km/h</strong> ✓</div>
<h4>Mouvement Uniformément Accéléré (MUA)</h4>
<div class="formula-box">v = v₀ + a×t | x = x₀ + v₀×t + ½a×t²</div>
<div class="example-box"><div class="ex-label">🚗 Démarrage d'une voiture</div>Voiture part de v₀=0, a=3 m/s². Après 4s:<br/>v = 0 + 3×4 = <strong>12 m/s = 43,2 km/h</strong><br/>Distance parcourue: x = ½×3×16 = <strong>24 m</strong></div>
<div class="us-box"><div class="us-label">🇺🇸 US Physics Vocabulary</div><strong>position, displacement, distance, velocity, speed, acceleration, uniform motion, uniformly accelerated, kinematics equations, free fall (g=9.8 m/s²), projectile motion.</strong><br/>Note: In US, g = 9.8 m/s² (we use 10 in France/Cameroon for simplicity)</div>`,
    en:`<h3>🏃 Kinematics — The Physics of Motion</h3>
<div class="formula-box">v = Δd/Δt | a = Δv/Δt | v = v₀+at | x = x₀+v₀t+½at²</div>
<div class="us-box"><div class="us-label">🇺🇸 US Key Vocabulary</div><strong>displacement (not distance!), velocity (vector), speed (scalar), acceleration, deceleration, free fall, terminal velocity, projectile.</strong> In US Physics: always distinguish displacement (vector, with direction) from distance (scalar, just magnitude).</div>`
  },
  l_phys_opt: {
    title:'Optique Géométrique', titleEn:'Geometric Optics',
    tags:['Physique 2nde C'], quizKey:'q_phys_opt',
    fr:`<h3>💡 L'Optique — La Lumière et ses Lois</h3>
<p>La lumière se propage en ligne droite (rayon lumineux) dans un milieu homogène à c = 3×10⁸ m/s dans le vide.</p>
<h4>Réflexion</h4>
<div class="formula-box">Loi de réflexion: i = r (angle d'incidence = angle de réflexion)</div>
<div class="example-box"><div class="ex-label">🪞 Miroir Plan</div>L'image dans un miroir est: virtuelle, droite, et symétrique par rapport au miroir. La loi i=r explique tout!</div>
<h4>Réfraction — Loi de Snell-Descartes</h4>
<div class="formula-box">n₁ × sin(θ₁) = n₂ × sin(θ₂) | n = indice de réfraction</div>
<div class="example-box"><div class="ex-label">🌊 Tige dans l'eau</div>n(air)=1, n(eau)=1.33. Une paille semble brisée dans un verre d'eau à cause de la réfraction! Le rayon change de direction en changeant de milieu.</div>
<h4>Lentilles</h4>
<div class="formula-box">Lentille convergente (loupe): focale f>0 | Divergente: f&lt;0<br/>Relation: 1/v − 1/u = 1/f (formule de conjugaison)</div>
<div class="us-box"><div class="us-label">🇺🇸 Optics in Real Life</div>Your glasses/contacts use refraction! Telescopes at NASA use mirrors (reflection). Fiber optics (internet cables!) use total internal reflection. Key US vocab: <strong>reflection, refraction, lens, focal length, converging, diverging, real/virtual image, index of refraction.</strong></div>`,
    en:`<h3>💡 Light & Optics</h3>
<div class="formula-box">Reflection: i=r | Refraction: n₁sinθ₁=n₂sinθ₂ | c=3×10⁸ m/s</div>
<div class="us-box"><div class="us-label">🇺🇸 Applications</div>Eyeglasses, cameras, microscopes, telescopes, fiber optic internet, lasers, endoscopes (medical imaging) — all use the principles of optics you just learned!</div>`
  },
  l_phys_elec: {
    title:'Circuits Électriques', titleEn:'Electric Circuits',
    tags:['Physique 2nde C','US Physical Science'], quizKey:'q_phys_elec',
    fr:`<h3>⚡ Circuits Électriques — Bases Fondamentales</h3>
<p>L'électricité alimente tout: téléphones, hôpitaux, écoles. Comprendre les circuits est essentiel pour l'ingénierie!</p>
<h4>Grandeurs Fondamentales</h4>
<div class="formula-box">Tension U (Volts V) | Intensité I (Ampères A) | Résistance R (Ohms Ω)</div>
<h4>Loi d'Ohm</h4>
<div class="formula-box">U = R × I (Loi d'Ohm fondamentale)</div>
<div class="example-box"><div class="ex-label">💡 Ampoule LED à Yaoundé</div>Ampoule connectée à 220V avec R=440Ω:<br/>I = U/R = 220/440 = <strong>0,5 A</strong><br/>Puissance: P = U×I = 220×0,5 = <strong>110 W</strong></div>
<h4>Circuits en Série vs Parallèle</h4>
<div class="formula-box">Série: I = I₁ = I₂, U = U₁ + U₂, R_total = R₁+R₂<br/>Parallèle: U = U₁ = U₂, I = I₁+I₂, 1/R_total = 1/R₁+1/R₂</div>
<div class="us-box"><div class="us-label">🇺🇸 Important! USA vs Cameroun</div>USA: 120V electrical system (not 220V like Cameroon!). Your Cameroonian chargers need a <strong>voltage adapter</strong> in the US. Also: US uses 60Hz frequency (Cameroon: 50Hz). Key vocab: <strong>voltage, current, resistance, Ohm's law, circuit, series, parallel, power (watts), conductors, insulators.</strong></div>`,
    en:`<h3>⚡ Electric Circuits</h3>
<div class="formula-box">Ohm's Law: V = I × R | Power: P = V × I</div>
<div class="example-box"><div class="ex-label">🔌 US vs Cameroon Voltage</div>Cameroon: 220V | USA: 120V. Your phone charger is fine (it works on both). But a Cameroonian hair dryer or appliance might need a voltage converter!</div>
<div class="us-box"><div class="us-label">🇺🇸 US Class Vocabulary</div><strong>voltage (V), current (A), resistance (Ω), Ohm's law, power (W), series circuit, parallel circuit, conductor, insulator, semiconductor, battery, EMF, short circuit.</strong></div>`
  },
  l_phys_energy: {
    title:'Énergie & Travail', titleEn:'Energy & Work',
    tags:['Physique 2nde C','US Physical Science'], quizKey:'q_phys_energy',
    fr:`<h3>⚡ Énergie & Travail Mécanique</h3>
<p>L'énergie est la capacité à effectuer un travail. Elle se transforme mais ne se crée ni ne se détruit — c'est la <strong>loi de conservation de l'énergie</strong>!</p>
<h4>Travail d'une Force</h4>
<div class="formula-box">W = F × d × cos(θ) (Joules J) | Si F parallèle à d: W = F × d</div>
<h4>Énergies Mécanique</h4>
<div class="formula-box">Cinétique: Ec = ½mv² | Potentielle: Ep = mgh | Mécanique: Em = Ec + Ep</div>
<div class="example-box"><div class="ex-label">💧 Barrage de Lagdo (Cameroun)</div>Le barrage de Lagdo (Nord Cameroun) convertit l'énergie potentielle de l'eau (Ep=mgh) en énergie cinétique (chute), puis en électricité (turbines). C'est la même physique que vous étudiez en 2nde C!</div>
<div class="formula-box">Puissance: P = W/t (Watts W) | P = F×v</div>
<div class="us-box"><div class="us-label">🇺🇸 Energy in US Science</div>US Science emphasizes energy transformations and conservation. Renewable energy (solar, wind, hydro) is a major topic. Key vocab: <strong>work, energy, kinetic energy, potential energy, conservation of energy, power, efficiency, joule, watt, renewable, fossil fuels, thermal energy.</strong></div>`,
    en:`<h3>⚡ Energy & Work</h3>
<div class="formula-box">Work W=Fd·cos(θ) | KE=½mv² | PE=mgh | ME=KE+PE | Power P=W/t</div>
<div class="us-box"><div class="us-label">🇺🇸 Conservation of Energy</div>Energy cannot be created or destroyed, only transformed. This is the most important law in all of physics! Solar panels convert light→electrical energy. Your phone battery converts chemical→electrical→light/sound energy.</div>`
  },

  // ══ CHEMISTRY ══
  l_chem_matter: {
    title:'États de la Matière', titleEn:'States of Matter',
    tags:['Chimie 2nde C','US Physical Science'], quizKey:'q_chem_matter',
    fr:`<h3>🧊 Les États de la Matière</h3>
<p>La matière existe sous 3 états principaux selon la température et la pression. Comprendre les transitions est fondamental en chimie!</p>
<h4>Les 3 États</h4>
<div class="example-box"><div class="ex-label">💧 H₂O sous 3 formes</div>• <strong>Solide</strong> (glace): molécules très liées, forme fixe, volume fixe, vibre<br/>• <strong>Liquide</strong> (eau): molécules liées mais mobiles, volume fixe, forme variable<br/>• <strong>Gaz</strong> (vapeur): molécules libres, volume et forme variables</div>
<h4>Transitions entre États</h4>
<div class="formula-box">Solide→Liquide: Fusion | Liquide→Gaz: Vaporisation/Ébullition<br/>Gaz→Liquide: Condensation | Liquide→Solide: Solidification<br/>Solide→Gaz: Sublimation (ex: glace carbonique)</div>
<div class="example-box"><div class="ex-label">🍳 Cuisine Camerounaise</div>L'eau bout à 100°C (à Yaoundé: ~98°C à cause de l'altitude). Pendant l'ébullition, la température reste constante: c'est le PALIER de changement d'état. Toute l'énergie sert à briser les liaisons intermoléculaires, pas à chauffer!</div>
<div class="us-box"><div class="us-label">🇺🇸 US Science Vocabulary</div><strong>solid, liquid, gas, plasma (4th state!), phase change, melting point, boiling point, evaporation, condensation, freezing, sublimation, intermolecular forces, temperature, pressure.</strong><br/>4th state: Plasma = superheated gas (stars, lightning, neon signs)</div>`,
    en:`<h3>🧊 States of Matter</h3>
<div class="formula-box">Solid (fixed shape) → Liquid (fixed volume) → Gas (no fixed shape or volume)</div>
<div class="us-box"><div class="us-label">🇺🇸 US Class Key Points</div>Water is the best example for phase changes. The temperature during a phase change STAYS CONSTANT (plateau). All energy goes into breaking bonds, not raising temperature. Plasma is the 4th state of matter — 99% of visible universe is plasma (stars)!</div>`
  },
  l_chem_react: {
    title:'Réactions Chimiques', titleEn:'Chemical Reactions',
    tags:['Chimie 2nde C','US Physical Science'], quizKey:'q_chem_react',
    fr:`<h3>🔥 Réactions Chimiques</h3>
<p>Une réaction chimique transforme des <strong>réactifs</strong> en <strong>produits</strong>. La loi de Lavoisier garantit que la masse est conservée!</p>
<h4>Équation Bilan</h4>
<div class="formula-box">Réactifs → Produits (conservation des atomes et des charges)</div>
<div class="example-box"><div class="ex-label">🔥 Charbon de bois (Cameroun)</div>Combustion du carbone: C + O₂ → CO₂<br/>Équilibrée: 1C + 1O₂ → 1CO₂ ✓ (1C=1C, 2O=2O)<br/>Ce qui se passe dans ton foyer camerounais chaque soir!</div>
<h4>Équilibrer une Équation</h4>
<div class="formula-box">H₂ + O₂ → H₂O ❌ (pas équilibrée)<br/>2H₂ + O₂ → 2H₂O ✅ (4H=4H, 2O=2O)</div>
<h4>Types de Réactions</h4>
<div class="example-box"><div class="ex-label">Types principaux</div>• <strong>Combustion</strong>: fuel + O₂ → CO₂ + H₂O (+ énergie!)<br/>• <strong>Synthèse</strong>: A + B → AB<br/>• <strong>Décomposition</strong>: AB → A + B<br/>• <strong>Précipitation</strong>: 2 solutions → solide insoluble (précipité)</div>
<div class="us-box"><div class="us-label">🇺🇸 Balancing Equations (US)</div>In US Chemistry, balancing equations is a core skill. The KEY rule: you can ONLY add coefficients (numbers in front), NEVER change subscripts inside formulas. Key vocab: <strong>reactant, product, balanced equation, law of conservation of mass, coefficient, subscript, synthesis, decomposition, combustion, single/double replacement.</strong></div>`,
    en:`<h3>🔥 Chemical Reactions</h3>
<div class="formula-box">Reactants → Products (mass always conserved!)<br/>Balance by adjusting COEFFICIENTS only — never change subscripts!</div>
<div class="example-box"><div class="ex-label">🔥 Combustion of Methane (Natural Gas)</div>CH₄ + 2O₂ → CO₂ + 2H₂O<br/>Check: 1C=1C ✓, 4H=4H ✓, 4O=4O ✓ Balanced!</div>
<div class="us-box"><div class="us-label">🇺🇸 US Types of Reactions</div>Synthesis (A+B→AB), Decomposition (AB→A+B), Single Replacement (A+BC→AC+B), Double Replacement (AB+CD→AD+CB), Combustion (fuel+O₂→CO₂+H₂O). Learn to identify reaction types!</div>`
  },
  l_chem_acids: {
    title:'Acides & Bases', titleEn:'Acids & Bases — pH Scale',
    tags:['Chimie 2nde C','US Chemistry'], quizKey:'q_chem_acids',
    fr:`<h3>🧪 Acides, Bases et pH</h3>
<p>Le pH mesure l'acidité ou la basicité d'une solution sur une échelle de 0 à 14. C'est crucial en biologie, médecine et chimie!</p>
<h4>L'Échelle de pH</h4>
<div class="formula-box">pH &lt; 7 : ACIDE | pH = 7 : NEUTRE (eau pure) | pH &gt; 7 : BASIQUE (alcalin)</div>
<div class="example-box"><div class="ex-label">🌍 pH dans la vie quotidienne</div>• Jus de citron: pH ≈ 2 (très acide)<br/>• Vinaigre (ndolé!): pH ≈ 3<br/>• Eau distillée: pH = 7 (neutre)<br/>• Sang humain: pH = 7.35–7.45 (légèrement basique)<br/>• Savon: pH ≈ 9–10<br/>• Soude caustique (NaOH): pH ≈ 14 (très basique)</div>
<h4>Neutralisation</h4>
<div class="formula-box">Acide + Base → Sel + Eau | HCl + NaOH → NaCl + H₂O</div>
<div class="example-box"><div class="ex-label">💊 Application Médicale</div>Les antiacides (Maalox, Rennie) neutralisent l'excès d'acide gastrique (HCl, pH ≈ 2) dans l'estomac avec une base (carbonate de calcium). C'est une neutralisation chimique!</div>
<div class="us-box"><div class="us-label">🇺🇸 pH in US Chemistry & Biology</div>pH is tested in US Chemistry AND Biology! Acid rain (pH&lt;5.6) damages ecosystems. Ocean acidification (CO₂ absorption) threatens coral reefs. Blood pH must stay 7.35-7.45 or you die. Key vocab: <strong>acid, base, pH scale, neutral, hydronium ion, hydroxide ion, neutralization, indicator, buffer, litmus paper.</strong></div>`,
    en:`<h3>🧪 Acids & Bases</h3>
<div class="formula-box">pH&lt;7=Acid | pH=7=Neutral | pH&gt;7=Base | Neutralization: acid+base→salt+water</div>
<div class="us-box"><div class="us-label">🇺🇸 Real-World Applications</div>Blood (pH 7.4) is a perfectly buffered solution — essential for life! Acid rain (pH&lt;5.6) damages forests and buildings. The ocean is slowly acidifying due to CO₂ absorption, threatening coral reefs. Your knowledge of pH can save ecosystems!</div>`
  },

  // ══ ELA ══
  l_ela_read: {
    title:'Reading Comprehension', titleEn:'Reading Comprehension Strategies',
    tags:['🇺🇸 ELA','8th Grade'], quizKey:'q_ela_read',
    fr:`<h3>📖 Stratégies de Compréhension en Lecture</h3>
<p>La compréhension de textes est la compétence #1 testée aux USA, dans toutes les matières! Ces stratégies te serviront toute ta vie.</p>
<h4>La Méthode SQ3R</h4>
<div class="example-box"><div class="ex-label">📚 SQ3R Step by Step</div>1. <strong>Survey</strong> (Survol): Lis les titres, sous-titres, illustrations. 1 min.<br/>2. <strong>Question</strong>: Transforme les titres en questions. Ex: "Newton's Laws" → "What are Newton's laws?"<br/>3. <strong>Read</strong>: Lis attentivement pour répondre à tes questions<br/>4. <strong>Recite</strong>: Ferme le livre, répète ce que tu as appris<br/>5. <strong>Review</strong>: Révise après 24h, 1 semaine, 1 mois</div>
<h4>Idée Principale vs Détails</h4>
<div class="formula-box">Main Idea = la grande idée du passage | Supporting Details = preuves, exemples, explications</div>
<h4>Inférence (lire entre les lignes)</h4>
<div class="example-box"><div class="ex-label">🔍 Exemple d'Inférence</div>Text: "Sarah grabbed her umbrella before leaving." → Inference: It's raining (the text doesn't say "raining" but we can infer it!)</div>
<div class="us-box"><div class="us-label">🇺🇸 US Reading Tests</div>US State Tests, SAT, and ACT heavily test reading comprehension. Common question types: main idea, supporting detail, vocabulary in context, author's purpose, inference, tone, compare/contrast texts. Practice daily with news articles (CNN, BBC, National Geographic)!</div>`,
    en:`<h3>📖 Reading Comprehension — US ELA</h3>
<div class="formula-box">SQ3R: Survey → Question → Read → Recite → Review</div>
<div class="example-box"><div class="ex-label">💡 Context Clues Strategy</div>When you see an unknown word, look at surrounding words for clues. "The arid, dry desert had almost no water." Even if you don't know "arid," context tells you it means dry!</div>
<div class="us-box"><div class="us-label">🇺🇸 Text Types in US Class</div>Informational: textbooks, articles, reports | Literary: fiction, poetry, drama. You must read both types fluently. Your bilingual advantage: French literature training gives you analytical skills that English-only students lack!</div>`
  },
  l_ela_write: {
    title:'Essay Writing', titleEn:'Writing Essays — 5-Paragraph Structure',
    tags:['🇺🇸 ELA','8th Grade','Writing'], quizKey:'q_ela_write',
    fr:`<h3>✍️ L'Essai Américain — Structure en 5 Paragraphes</h3>
<p>Aux USA, les essays (dissertations) suivent une structure claire et standard. Maîtriser cette structure = maîtriser l'écriture académique américaine!</p>
<h4>Structure Standard (5-Paragraph Essay)</h4>
<div class="example-box"><div class="ex-label">📄 Structure Obligatoire</div>1. <strong>Introduction</strong>: Hook → Background → <strong>Thesis Statement</strong><br/>2. <strong>Body Paragraph 1</strong>: Topic Sentence → Evidence → Analysis → Transition<br/>3. <strong>Body Paragraph 2</strong>: Topic Sentence → Evidence → Analysis → Transition<br/>4. <strong>Body Paragraph 3</strong>: Topic Sentence → Evidence → Analysis → Transition<br/>5. <strong>Conclusion</strong>: Restate thesis → Summary → Closing thought ("So what?")</div>
<h4>La Thesis Statement — Le Cœur de l'Essay</h4>
<div class="formula-box">Thesis = Topic + Position + 3 Reasons<br/>"STEM education is crucial for African girls because it [reason1], [reason2], and [reason3]."</div>
<div class="example-box"><div class="ex-label">✅ Strong Thesis vs ❌ Weak</div>❌ "Climate change is bad." (trop vague)<br/>✅ "Climate change threatens Lake Chad because it accelerates desertification, destroys fishing economies, and displaces communities." (spécifique + 3 raisons!)</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Unique Essay Advantage</div>Your story as a bilingual Cameroonian student moving to the USA is POWERFUL essay material. College application essays, scholarship essays, and class essays — use YOUR experience. Admission officers at Harvard, MIT, Stanford read thousands of essays. Yours can be unforgettable.</div>`,
    en:`<h3>✍️ The 5-Paragraph Essay</h3>
<div class="formula-box">Hook → Background → Thesis | Topic → Evidence → Analysis | Restate → Summary → "So what?"</div>
<div class="example-box"><div class="ex-label">🎯 Perfect Thesis Formula</div>[Topic] + [your position] + [3 supporting reasons]. Example: "Access to technology transforms education because it enables personalized learning, connects students globally, and develops 21st-century skills."</div>
<div class="us-box"><div class="us-label">🇺🇸 Essay Types You'll Write</div>Argumentative (most common), Expository (explain), Narrative (story), Descriptive, Compare/Contrast, Literary Analysis. For each type, the 5-paragraph structure is your foundation.</div>`
  },
  l_ela_lit: {
    title:'Literary Analysis', titleEn:'Literary Analysis & Devices',
    tags:['🇺🇸 ELA','8th Grade','Literature'], quizKey:'q_ela_lit',
    fr:`<h3>📚 Analyse Littéraire — Les Éléments de Fiction</h3>
<p>L'analyse littéraire te demande d'examiner comment et pourquoi un auteur crée des effets sur le lecteur. C'est différent de simplement "résumer"!</p>
<h4>Éléments Fondamentaux</h4>
<div class="example-box"><div class="ex-label">📖 Les 5 Éléments</div>• <strong>Plot</strong> (Intrigue): exposition → rising action → climax → falling action → resolution<br/>• <strong>Character</strong>: protagonist, antagonist, round/flat, static/dynamic<br/>• <strong>Setting</strong>: lieu + époque + atmosphère<br/>• <strong>Theme</strong>: message central du texte (PAS le résumé!)<br/>• <strong>Conflict</strong>: man vs man, vs nature, vs self, vs society</div>
<h4>Procédés Littéraires (Literary Devices)</h4>
<div class="formula-box">Simile: "She runs like the wind" | Metaphor: "She is the wind"<br/>Personification | Hyperbole | Foreshadowing | Irony | Symbolism</div>
<div class="example-box"><div class="ex-label">🇨🇲 "Une Vie de Boy" (Oyono)</div>Ferdinand Oyono utilise l'ironie pour critiquer le colonialisme: Toundi (le "boy") observe naïvement l'hypocrisie des colons. Le <strong>thème</strong> = l'aliénation coloniale. Le <strong>conflit</strong> = homme vs société (coloniale).</div>
<div class="us-box"><div class="us-label">🇺🇸 US Literary Analysis Essay</div>Format: claim about theme/device + evidence from text (quote) + analysis of how/why it matters. Avoid plot summary! Teachers want analysis. Key vocab: <strong>theme, motif, symbol, foreshadowing, irony, characterization, point of view, narrator, tone, mood, diction, imagery, allusion.</strong></div>`,
    en:`<h3>📚 Literary Analysis</h3>
<div class="formula-box">Elements: Plot | Character | Setting | Theme | Conflict | Point of View</div>
<div class="example-box"><div class="ex-label">✅ Analysis vs Summary</div>Summary: "The main character is poor and becomes rich." ← NOT analysis!<br/>Analysis: "The protagonist's journey from poverty to wealth symbolizes the American Dream's promise, but the author uses irony to show its hollow reality." ← Analysis!</div>
<div class="us-box"><div class="us-label">🇺🇸 Books You May Read in US ELA</div>Common 8th grade reads: The Outsiders, To Kill a Mockingbird, Romeo & Juliet, Animal Farm, The Giver, Flowers for Algernon. Start reading them now on Project Gutenberg (free!) to get ahead!</div>`
  },
  l_ela_speak: {
    title:'Public Speaking', titleEn:'Public Speaking & Presentations',
    tags:['🇺🇸 ELA','Communication'], quizKey:'q_ela_speak',
    fr:`<h3>🎤 L'Art de Parler en Public</h3>
<p>Aux USA, les présentations orales sont obligatoires dans presque tous les cours. C'est une compétence qui te différenciera toute ta vie!</p>
<h4>Structure d'un Discours Efficace</h4>
<div class="formula-box">Hook (accroche) → Thesis → Body Points (3) → Conclusion + Call to Action</div>
<h4>Techniques d'Accroche (Hooks)</h4>
<div class="example-box"><div class="ex-label">🎯 Types de Hooks</div>• <strong>Question rhétorique</strong>: "Have you ever wondered why some countries lack clean water?"<br/>• <strong>Statistique choc</strong>: "Every 2 minutes, a child dies of malaria — a preventable disease."<br/>• <strong>Anecdote personnelle</strong>: "I was 13 when I left Cameroon for America..."<br/>• <strong>Citation</strong>: "As Marie Curie said, 'Nothing in life is to be feared, only to be understood.'"</div>
<h4>Communication Non-Verbale</h4>
<div class="example-box"><div class="ex-label">👁️ Body Language Tips</div>• Contact visuel: regarde le public, pas tes notes (70% du temps)<br/>• Posture droite: montre la confiance<br/>• Gestes naturels: soulignent les points importants<br/>• Voix: varie le rythme, le volume, fais des pauses dramatiques<br/>• Ton anxieux normal: 73% des gens ont peur de parler en public!</div>
<div class="us-box"><div class="us-label">🇺🇸 Presentations in US School</div>Socratic seminars, book talks, science project presentations, debate class, oral history projects — US schools present A LOT. Practice makes perfect. TED Talks (ted.com) are great models. Watch 3 TED Talks per week to absorb great presentation style!</div>`,
    en:`<h3>🎤 Public Speaking</h3>
<div class="formula-box">Hook → Thesis → 3 Body Points → Conclusion + Call to Action</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Unique Advantage</div>As a bilingual student from Cameroon, you have incredible stories that most US students can't tell. Your personal narrative IS your competitive advantage. Use it! Authenticity beats polish every time in US public speaking.</div>`
  },

  // ══ LIFE SCIENCE ══
  l_sci_cell: {
    title:'La Cellule Vivante', titleEn:'The Living Cell',
    tags:['Life Science','US 8th Grade'], quizKey:'q_sci_cell',
    fr:`<h3>🔬 La Cellule — Unité de Vie</h3>
<p>La <strong>théorie cellulaire</strong>: (1) Tout être vivant est composé de cellules. (2) La cellule est l'unité de base de la vie. (3) Toute cellule vient d'une cellule préexistante.</p>
<h4>Procaryotes vs Eucaryotes</h4>
<div class="example-box"><div class="ex-label">🦠 Deux Grands Types</div>• <strong>Procaryote</strong> (bactérie): pas de noyau vrai, ADN libre dans le cytoplasme<br/>• <strong>Eucaryote</strong> (animaux, plantes, champignons): noyau membraneux, organites complexes</div>
<h4>Organites Clés (Cellule Eucaryote)</h4>
<div class="formula-box">Noyau (ADN) | Mitochondrie (énergie ATP) | Ribosome (protéines)<br/>Membrane plasmique (contrôle entrées/sorties) | Cytoplasme</div>
<div class="example-box"><div class="ex-label">🌿 Cellule Végétale (en plus)</div>Paroi cellulaire (rigide) + Chloroplastes (photosynthèse: lumière → énergie) + Grande vacuole centrale</div>
<div class="example-box"><div class="ex-label">💉 Cellules sanguines du Cameroun</div>Les globules rouges (érythrocytes) transportent O₂ grâce à l'hémoglobine. La drépanocytose (fréquente en Afrique) déforme ces cellules → moins d'O₂. C'est un exemple de génétique ET de biologie cellulaire!</div>
<div class="us-box"><div class="us-label">🇺🇸 Cell Biology in US Science</div>Key vocab: <strong>cell theory, prokaryote, eukaryote, nucleus, mitochondria, ribosomes, cell membrane, cytoplasm, vacuole, chloroplast, cell wall, DNA, organelle, unicellular, multicellular, diffusion, osmosis.</strong></div>`,
    en:`<h3>🔬 The Cell</h3>
<div class="formula-box">Cell Theory: All life = cells | Basic unit of life | Cells come from cells</div>
<div class="us-box"><div class="us-label">🇺🇸 Key Vocabulary</div><strong>nucleus, mitochondria ("powerhouse of the cell"), ribosomes, cell membrane, cytoplasm, vacuole, chloroplast, cell wall, prokaryote, eukaryote, organelle, cell division, mitosis, meiosis.</strong></div>`
  },
  l_sci_gen: {
    title:'Génétique & ADN', titleEn:'Genetics & DNA',
    tags:['Life Science','US 8th Grade'], quizKey:'q_sci_gen',
    fr:`<h3>🧬 La Génétique — Science de l'Hérédité</h3>
<p>La génétique explique pourquoi tu ressembles à tes parents et comment les traits se transmettent. C'est aussi la base de la médecine moderne!</p>
<h4>De l'ADN aux Traits</h4>
<div class="formula-box">ADN → Gènes → Allèles → Génotype → Phénotype</div>
<div class="example-box"><div class="ex-label">🔑 Définitions Clés</div>• <strong>ADN</strong>: double hélice de nucléotides (A-T, C-G). 46 chromosomes chez l'humain<br/>• <strong>Gène</strong>: séquence d'ADN codant un trait (couleur des yeux, groupe sanguin...)<br/>• <strong>Allèle</strong>: version d'un gène (ex: B=brun, b=clair pour les yeux)<br/>• <strong>Génotype</strong>: composition allélique (BB, Bb, bb)<br/>• <strong>Phénotype</strong>: trait visible (yeux bruns, yeux clairs)</div>
<h4>Carré de Punnett</h4>
<div class="example-box"><div class="ex-label">🇨🇲 Drépanocytose (Sickle Cell)</div>Très répandue en Afrique (protection contre le paludisme!). Allèle: HbA (normal), HbS (drépanocytose).<br/>Parents HbA×HbS croisés: 25% HbSHbS (malade), 50% HbAHbS (porteur), 25% HbAHbA (sain)<br/>→ Utilise le carré de Punnett pour le calculer!</div>
<div class="us-box"><div class="us-label">🇺🇸 Genetics in US Science</div>Key vocab: <strong>DNA, gene, allele, dominant, recessive, genotype, phenotype, Punnett square, heredity, trait, chromosome, mutation, genetic disorder, biotechnology, CRISPR (gene editing — the future!)</strong></div>`,
    en:`<h3>🧬 Genetics & DNA</h3>
<div class="formula-box">DNA → Genes → Alleles → Genotype → Phenotype</div>
<div class="example-box"><div class="ex-label">🧩 Dominant vs Recessive</div>Dominant allele (B) masks recessive (b). BB or Bb = dominant phenotype. Only bb = recessive phenotype shows. Punnett square predicts probability of each combination.</div>
<div class="us-box"><div class="us-label">🇺🇸 Future Careers</div>Genomics, genetic counseling, biomedical engineering, CRISPR therapy — these are among the fastest-growing and highest-paying STEM careers. Your genetics knowledge starts here!</div>`
  },
  l_sci_eco: {
    title:'Écosystèmes & Environnement', titleEn:'Ecosystems & Environment',
    tags:['Life Science','Earth Science','US 8th Grade'], quizKey:'q_sci_eco',
    fr:`<h3>🌿 Les Écosystèmes</h3>
<p>Un <strong>écosystème</strong> = communauté d'êtres vivants + leur environnement non-vivant en interaction. Le Cameroun abrite certains des écosystèmes les plus riches de la planète!</p>
<h4>Flux d'Énergie</h4>
<div class="formula-box">Producteurs (plantes) → Consommateurs primaires (herbivores) → Consommateurs secondaires (carnivores) → Décomposeurs</div>
<div class="example-box"><div class="ex-label">🌳 Forêt Tropicale du Cameroun</div>Le Cameroun = 2ème plus grande forêt tropicale d'Afrique (après Congo)! Chaîne alimentaire: Feuilles → Gorille → Léopard → Décomposeurs (champignons)<br/>Biodiversité record: 9,000+ espèces de plantes, 300+ mammifères, 600+ oiseaux!</div>
<h4>Biomes Mondiaux</h4>
<div class="example-box"><div class="ex-label">🌍 Biomes</div>Forêt tropicale | Savane | Désert | Forêt tempérée | Taïga | Toundra | Océan</div>
<h4>Menaces et Conservation</h4>
<div class="example-box"><div class="ex-label">⚠️ Impacts Humains</div>Déforestation (Cameroun perd 600 000 ha/an!) → perte de biodiversité, CO₂ libéré → réchauffement climatique. Solutions: Aires protégées, reforestation, agriculture durable.</div>
<div class="us-box"><div class="us-label">🇺🇸 Environmental Science</div>Major US topic: biodiversity, food webs, biomes, human impact, climate change, conservation. Key vocab: <strong>ecosystem, biome, food chain, food web, trophic level, producer, consumer, decomposer, biodiversity, habitat, invasive species, carrying capacity, sustainability.</strong></div>`,
    en:`<h3>🌿 Ecosystems</h3>
<div class="formula-box">Producers → Primary Consumers → Secondary Consumers → Decomposers (Energy pyramid)</div>
<div class="us-box"><div class="us-label">🇺🇸 Cameroon's Role in Global Ecology</div>Cameroon's Congo Basin rainforest stores billions of tons of carbon — it's a global climate stabilizer! As a Cameroonian, you have a personal connection to the world's most important conservation issues. Use this in your essays and science projects!</div>`
  },
  l_sci_body: {
    title:'Systèmes du Corps Humain', titleEn:'Human Body Systems',
    tags:['Life Science','Health','US 8th Grade'], quizKey:'q_sci_body',
    fr:`<h3>🫀 Les Systèmes du Corps Humain</h3>
<p>Ton corps est une machine extraordinaire composée de 11 systèmes qui travaillent ensemble!</p>
<h4>Principaux Systèmes</h4>
<div class="example-box"><div class="ex-label">🔑 Les Systèmes Essentiels</div>• <strong>Circulatoire</strong>: cœur + vaisseaux. Pompe le sang (O₂, nutriments, déchets). 100 000 batt./jour!<br/>• <strong>Respiratoire</strong>: poumons + voies aériennes. Échanges O₂/CO₂ dans les alvéoles<br/>• <strong>Digestif</strong>: bouche→estomac→intestin. Transforme les aliments en énergie et nutriments<br/>• <strong>Nerveux</strong>: cerveau + moelle épinière + nerfs. Centre de commande. 100 milliards de neurones!<br/>• <strong>Musculo-squelettique</strong>: 206 os + 600+ muscles. Structure et mouvement<br/>• <strong>Excréteur</strong>: reins + peau. Filtre les déchets (urine, sueur)<br/>• <strong>Immunitaire</strong>: globules blancs. Défense contre les infections</div>
<h4>Homéostasie</h4>
<div class="formula-box">Homéostasie = maintien des conditions internes stables (37°C, pH sanguin 7.4, glycémie...)</div>
<div class="us-box"><div class="us-label">🇺🇸 Human Biology in US Science</div>Key vocab: <strong>circulatory, respiratory, digestive, nervous, skeletal, muscular, immune, endocrine, reproductive system, homeostasis, organ, tissue, cell, cardiovascular, alveoli, neuron, hormone.</strong></div>`,
    en:`<h3>🫀 Human Body Systems</h3>
<div class="formula-box">11 Systems working together to maintain homeostasis (stable internal conditions)</div>
<div class="us-box"><div class="us-label">🇺🇸 Health Connections</div>Understanding body systems helps you make better health decisions: why exercise strengthens your heart (circulatory), why vegetables fuel your cells (digestive), why sleep is essential for your brain (nervous system). Knowledge = power over your own health!</div>`
  },

  // ══ EARTH & SPACE ══
  l_earth_solar: {
    title:'Le Système Solaire', titleEn:'The Solar System',
    tags:['Earth & Space','US 8th Grade'], quizKey:'q_earth_solar',
    fr:`<h3>🌍 Notre Système Solaire</h3>
<p>Notre étoile le Soleil et les 8 planètes qui l'orbitent forment le Système Solaire, situé dans la galaxie de la Voie Lactée.</p>
<h4>Les 8 Planètes</h4>
<div class="formula-box">Mercure - Vénus - Terre - Mars | Jupiter - Saturne - Uranus - Neptune<br/>Moyen mnémotechnique US: "My Very Educated Mother Just Served Us Noodles"</div>
<div class="example-box"><div class="ex-label">🔭 Faits Fascinants</div>• Jupiter = 1 300× la taille de la Terre (géante gazeuse)<br/>• Saturne a des anneaux de glace et roches (70% de la largeur terrestre!)<br/>• La lumière du Soleil met 8 min pour atteindre la Terre<br/>• Mercure: pas de saisons (axe droit), mais températures de -173°C à +427°C!</div>
<h4>Phases de la Lune</h4>
<div class="formula-box">Nouvelle → Croissant → 1er Quartier → Gibbeuse → Pleine → Décroissant → Dernier Quartier → Nouvelle</div>
<div class="example-box"><div class="ex-label">🌊 Marées</div>La gravité de la Lune attire les océans → marées hautes/basses (2 fois par jour). Les marées de l'Atlantique affectent les côtes du Cameroun!</div>
<div class="us-box"><div class="us-label">🇺🇸 Space Science in US Class</div>Key vocab: <strong>solar system, planet, orbit, revolution, rotation, moon phases, eclipse, tides, gravity, asteroid, comet, meteor, galaxy, Milky Way, light-year, astronomical unit (AU).</strong><br/>NASA missions: Artemis (Moon return), Mars rovers (Perseverance), James Webb Space Telescope (sees 13.8 billion years ago!)</div>`,
    en:`<h3>🌍 The Solar System</h3>
<div class="formula-box">My Very Educated Mother Just Served Us Noodles = Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune</div>
<div class="us-box"><div class="us-label">🇺🇸 NASA & Space Careers</div>NASA employs thousands of engineers, scientists, and researchers — many are African-American and immigrants! Dr. Mae Jemison was the first Black female astronaut. Katherine Johnson (Hidden Figures) calculated orbital trajectories. Space is for everyone!</div>`
  },
  l_earth_struct: {
    title:'Structure de la Terre', titleEn:"Earth's Structure",
    tags:['Earth & Space','US 8th Grade'], quizKey:'q_earth_struct',
    fr:`<h3>🌋 La Structure Interne de la Terre</h3>
<p>La Terre est structurée comme un oignon en couches concentriques, chacune avec des propriétés différentes.</p>
<h4>Les Couches Terrestres</h4>
<div class="formula-box">Croûte (0-35 km) → Manteau (35-2900 km) → Noyau externe liquide → Noyau interne solide</div>
<h4>Tectonique des Plaques</h4>
<div class="example-box"><div class="ex-label">🌍 15 Grandes Plaques</div>La lithosphère est divisée en plaques qui se déplacent de 2-10 cm/an (vitesse des ongles!).<br/>• Plaques divergentes → rift, dorsale océanique (lave)<br/>• Plaques convergentes → montagnes, fosses océaniques, volcans<br/>• Plaques transformantes → failles, tremblements de terre (San Andreas en Californie!)</div>
<div class="example-box"><div class="ex-label">🌋 Mont Cameroun</div>Le Mont Cameroun (4070m) = volcan actif le plus haut d'Afrique de l'Ouest. Dernière éruption: 2012! Il est actif car il se trouve sur une zone de failles tectoniques.</div>
<div class="us-box"><div class="us-label">🇺🇸 US Earth Science</div>California (where many African immigrants live!) sits on the San Andreas Fault — constant earthquake risk. Knowing geology = knowing how to stay safe! Key vocab: <strong>crust, mantle, outer core, inner core, tectonic plates, earthquake, volcano, seismic waves, Richter scale, fault, subduction, convergent, divergent, transform boundary.</strong></div>`,
    en:`<h3>🌋 Earth's Structure & Plate Tectonics</h3>
<div class="formula-box">Crust → Mantle → Outer Core (liquid) → Inner Core (solid)</div>
<div class="us-box"><div class="us-label">🇺🇸 California Earthquake Safety</div>If you move to California, Oregon, or Washington state — all on the Pacific Ring of Fire — you must know earthquake safety: Drop, Cover, Hold On. Know where your school's emergency exits are. FEMA has free earthquake prep guides at ready.gov.</div>`
  },
  l_earth_climate: {
    title:'Changement Climatique', titleEn:'Climate Change',
    tags:['Earth & Space','Climate Justice','US 8th Grade'], quizKey:'q_earth_climate',
    fr:`<h3>🌡️ Le Changement Climatique</h3>
<p>Le réchauffement climatique est la crise majeure de votre génération. Tu peux faire partie de la solution!</p>
<h4>L'Effet de Serre Naturel vs Amplifié</h4>
<div class="formula-box">Soleil → Terre → IR réémis → Gaz à effet de serre piègent la chaleur</div>
<div class="example-box"><div class="ex-label">🌡️ Les Chiffres Alarmants</div>• +1.1°C depuis l'ère préindustrielle (objectif: &lt;+1.5°C Paris 2015)<br/>• CO₂ atmosphérique: 280 ppm avant industrie → 420 ppm aujourd'hui (record!)<br/>• Glaciers arctiques: -13% par décennie<br/>• Lac Tchad (Cameroun): rétréci de <strong>90%</strong> depuis 1960!</div>
<h4>Causes et Conséquences</h4>
<div class="example-box"><div class="ex-label">⚡ Causes vs Solutions</div>Causes: combustion fossile (70%), déforestation (11%), agriculture (11%)<br/>Solutions: énergie solaire/éolienne, forêts protégées, mobilité électrique, alimentation végétale, efficacité énergétique</div>
<div class="us-box"><div class="us-label">🇺🇸 Climate Justice & Africa</div>Africa contributes &lt;4% of global CO₂ emissions but suffers the MOST from climate impacts. This injustice is called "climate inequality." As a future scientist from Cameroon, you can be part of the solution — climate scientists, renewable energy engineers, and policy makers are urgently needed!</div>`,
    en:`<h3>🌡️ Climate Change</h3>
<div class="formula-box">Greenhouse gases (CO₂, CH₄, N₂O) trap heat → global temperature rise → cascade of effects</div>
<div class="us-box"><div class="us-label">🇺🇸 STEM & Climate Careers</div>Environmental Science, Climate Engineering, Renewable Energy, and Environmental Policy are among the fastest-growing career fields. Your African perspective on climate impacts is valuable — the US needs scientists who understand global climate justice.</div>`
  },
  l_earth_weather: {
    title:'Météorologie', titleEn:'Weather & Atmosphere',
    tags:['Earth & Space','US 8th Grade'], quizKey:'q_earth_weather',
    fr:`<h3>⛈️ La Météorologie — Temps et Atmosphère</h3>
<p>La <strong>météo</strong> (court terme: aujourd'hui, cette semaine) ≠ le <strong>climat</strong> (long terme: tendances sur des décennies).</p>
<h4>L'Atmosphère Terrestre</h4>
<div class="formula-box">Troposphère (0-12 km, météo) | Stratosphère (12-50 km, couche d'ozone) | Mésosphère | Thermosphère | Exosphère</div>
<h4>Formation des Nuages et Précipitations</h4>
<div class="example-box"><div class="ex-label">☁️ Cycle de l'Eau</div>Évaporation (océans) → Condensation (nuages) → Précipitations (pluie, neige) → Ruissellement → Évaporation...<br/>La mousson camerounaise (saison des pluies mai-novembre) = ce cycle à grande échelle!</div>
<h4>Phénomènes Météo Extrêmes</h4>
<div class="example-box"><div class="ex-label">⚡ Phénomènes aux USA</div>Tornades (Tornado Alley: Texas, Oklahoma, Kansas), Ouragans (côtes sud-est, Floride, Louisiane), Blizzards (Nord), Sécheresses (Californie), Tempêtes de verglas (Nord-Est). Chaque région a ses propres risques!</div>
<div class="us-box"><div class="us-label">🇺🇸 US Weather Alerts System</div>National Weather Service sends alerts: Watch (conditions possible) → Warning (imminent) → Emergency. In US school, you'll practice tornado drills! Key vocab: <strong>atmosphere, front, pressure, humidity, precipitation, evaporation, condensation, storm, tornado, hurricane, blizzard, drought, forecast, barometer.</strong></div>`,
    en:`<h3>⛈️ Weather & Atmosphere</h3>
<div class="formula-box">Weather = short-term atmospheric conditions | Climate = long-term weather patterns</div>
<div class="us-box"><div class="us-label">🇺🇸 US Weather Emergencies</div>Depending on where you live in the US: tornadoes (Midwest), hurricanes (Southeast/Gulf), blizzards (Northeast/Midwest), earthquakes (West Coast). Learn your local emergency protocols at school — they'll practice drills!</div>`
  },

  // ══ US HISTORY ══
  l_hist_rev: {
    title:'La Révolution Américaine', titleEn:'The American Revolution',
    tags:['🇺🇸 US History','Social Studies'], quizKey:'q_hist_rev',
    fr:`<h3>🗽 La Révolution Américaine (1765-1783)</h3>
<p>La Révolution américaine est la naissance des États-Unis. Comprendre cela, c'est comprendre les valeurs fondamentales du pays où tu vas vivre!</p>
<h4>Les Causes de la Révolution</h4>
<div class="example-box"><div class="ex-label">🔥 La Colère des Colonistes</div>• Taxes imposées par l'Angleterre sans représentation au Parlement<br/>• Slogan: <strong>"No Taxation Without Representation!"</strong><br/>• Boston Tea Party (1773): colonistes jettent du thé anglais dans le port<br/>• Boston Massacre (1770): soldats anglais tuent 5 colonistes</div>
<h4>Les Documents Fondateurs</h4>
<div class="formula-box">Déclaration d'Indépendance: July 4, 1776 | Auteur principal: Thomas Jefferson<br/>"We hold these truths to be self-evident: all men are created equal..."</div>
<div class="example-box"><div class="ex-label">🏆 Les Pères Fondateurs (Founding Fathers)</div>George Washington (général, 1er Président), Thomas Jefferson (rédacteur), Benjamin Franklin (diplomate), James Madison (Constitution), Alexander Hamilton (système financier)</div>
<div class="us-box"><div class="us-label">🇺🇸 Why This Matters for You</div>These founding ideals — liberty, equality, pursuit of happiness — are the values that make the US a destination for immigrants like you. The Declaration is essentially a promise that applies to everyone. Understanding this history helps you claim your place in America.</div>`,
    en:`<h3>🗽 The American Revolution</h3>
<div class="formula-box">"No Taxation Without Representation" → Revolution → Independence July 4, 1776</div>
<div class="us-box"><div class="us-label">🇺🇸 Key Terms for US History Class</div><strong>colony, taxation, independence, Founding Fathers, Declaration of Independence, Constitution, self-governance, republic, George Washington, Thomas Jefferson, Continental Army, treaty.</strong></div>`
  },
  l_hist_const: {
    title:'La Constitution Américaine', titleEn:'The US Constitution & Bill of Rights',
    tags:['🇺🇸 US History','Civics'], quizKey:'q_hist_const',
    fr:`<h3>📜 La Constitution des États-Unis</h3>
<p>La Constitution américaine (1787) est le texte fondamental qui organise le gouvernement US. Ses 27 amendements protègent tes droits!</p>
<h4>Structure de la Constitution</h4>
<div class="example-box"><div class="ex-label">📋 Organisation</div>• <strong>Préambule</strong>: "We the People..." (gouvernement du peuple, par le peuple)<br/>• <strong>Articles 1-3</strong>: Les 3 branches du gouvernement<br/>• <strong>Articles 4-7</strong>: Relations entre États, suprématie fédérale<br/>• <strong>27 Amendements</strong>: Modifications au fil du temps</div>
<h4>Les Amendements Cruciaux pour Toi</h4>
<div class="example-box"><div class="ex-label">🔑 Amendements à Connaître</div>• <strong>1er</strong>: Liberté d'expression, de religion, de presse, de réunion<br/>• <strong>4e</strong>: Protection contre les fouilles sans mandat<br/>• <strong>5e</strong>: Droit au silence, double jeopardy<br/>• <strong>14e</strong>: Égale protection sous la loi → CRUCIAL pour immigrants et minorités!<br/>• <strong>19e</strong>: Droit de vote aux femmes (1920)<br/>• <strong>26e</strong>: Droit de vote à 18 ans</div>
<div class="us-box"><div class="us-label">🇺🇸 The 14th Amendment — Your Shield</div>The 14th Amendment (1868) says the government must provide "equal protection under the law" to ALL persons (not just citizens). This is why Plyler v. Doe guarantees your education rights, regardless of immigration status!</div>`,
    en:`<h3>📜 US Constitution & Amendments</h3>
<div class="formula-box">1st Amendment: Free speech, religion, press, assembly, petition<br/>14th Amendment: Equal protection for ALL persons (including non-citizens!)</div>
<div class="us-box"><div class="us-label">🇺🇸 Citizenship Test — 100 Questions</div>To become a US citizen, you must pass a test covering the Constitution, US history, and government. Start studying now — you can access the official USCIS study materials at uscis.gov/citizenship. Many questions cover exactly what you're learning here!</div>`
  },
  l_hist_civil: {
    title:'Guerre Civile & Reconstruction', titleEn:'Civil War & Reconstruction',
    tags:['🇺🇸 US History'], quizKey:'q_hist_civil',
    fr:`<h3>⚔️ La Guerre Civile Américaine (1861-1865)</h3>
<p>La guerre la plus meurtrière de l'histoire américaine (~620 000 morts) a défini qui sont les Américains et quelles sont leurs valeurs.</p>
<h4>Causes de la Guerre</h4>
<div class="example-box"><div class="ex-label">🔥 Les Tensions</div>• Esclavage: économie sudiste basée sur le travail forcé des Africains<br/>• Droits des États (States' Rights): jusqu'où l'État fédéral peut-il imposer ses lois?<br/>• Expansion: les nouveaux États de l'Ouest seront-ils esclavagistes?<br/>• Élection d'Abraham Lincoln (1860): le Sud craint l'abolition</div>
<h4>Les Tournants</h4>
<div class="formula-box">1863: Proclamation d'Émancipation (Lincoln libère les esclaves des États confédérés)<br/>1865: Victoire de l'Union + 13e Amendement (abolition définitive)</div>
<div class="example-box"><div class="ex-label">🔗 Connexion Africaine</div>Environ 4 millions d'Africains réduits en esclavage ont été émancipés en 1865. Beaucoup venaient d'Afrique de l'Ouest et Centrale — peut-être certains de la région du Cameroun. L'histoire des Afro-Américains est partiellement l'histoire de l'Afrique.</div>
<div class="us-box"><div class="us-label">🇺🇸 Reconstruction & Legacy</div>After the Civil War, the US tried to rebuild (Reconstruction 1865-1877): gave formerly enslaved people citizenship rights. But it was undermined by Jim Crow laws (segregation until 1960s). This history explains much of US racial inequality today.</div>`,
    en:`<h3>⚔️ Civil War</h3>
<div class="formula-box">Cause: slavery + states' rights | Result: Union victory + 13th Amendment (abolished slavery, 1865)</div>
<div class="us-box"><div class="us-label">🇺🇸 Why This History Matters Now</div>Understanding the Civil War helps you understand: Black Lives Matter movement, debates about Confederate statues, racial wealth gaps, and why African American culture and history is emphasized in US schools today. As an African immigrant, this history is also partly YOUR history.</div>`
  },
  l_hist_cr: {
    title:'Mouvement des Droits Civiques', titleEn:'Civil Rights Movement',
    tags:['🇺🇸 US History','Social Justice'], quizKey:'q_hist_cr',
    fr:`<h3>✊ Le Mouvement des Droits Civiques (1954-1968)</h3>
<p>Après l'abolition de l'esclavage, les Afro-Américains ont subi la <strong>ségrégation légale</strong> pendant 100 ans. Ce mouvement héroïque a changé l'Amérique!</p>
<h4>Moments Clés</h4>
<div class="example-box"><div class="ex-label">🗓️ Chronologie Essentielle</div>• 1954: Brown v. Board of Education → fin de la ségrégation scolaire<br/>• 1955: Rosa Parks refuse de céder sa place dans le bus (Montgomery, Alabama)<br/>• 1955-56: Boycott des bus de Montgomery (381 jours!) → victoire!<br/>• 1963: March on Washington → "I Have a Dream" (MLK) → 250 000 personnes<br/>• 1964: Civil Rights Act → interdit discrimination basée sur race, couleur, sexe<br/>• 1965: Voting Rights Act → protège le droit de vote des Noirs</div>
<h4>Leaders Incontournables</h4>
<div class="example-box"><div class="ex-label">🌟 Figures Historiques</div>Dr. Martin Luther King Jr., Rosa Parks, John Lewis, Thurgood Marshall, Malcolm X, Bayard Rustin, Medgar Evers, Fannie Lou Hamer (pionnière du vote féminin noir)</div>
<div class="us-box"><div class="us-label">🇺🇸 Relevance for You Today</div>As an African immigrant, you benefit from the rights fought for by the Civil Rights Movement. Your children's future in America was shaped by these heroes. February = Black History Month in US schools — know these names and stories!</div>`,
    en:`<h3>✊ Civil Rights Movement</h3>
<div class="formula-box">Segregation → Boycotts + Marches + Legal challenges → Civil Rights Act (1964) + Voting Rights Act (1965)</div>
<div class="us-box"><div class="us-label">🇺🇸 Ongoing Relevance</div>MLK's dream is not fully realized. The Civil Rights Movement's methods — peaceful protest, legal challenges, community organizing — are still used today. Understanding this history helps you participate in American democracy as an informed, empowered citizen.</div>`
  },
  l_hist_modern: {
    title:'USA Moderne', titleEn:'Modern America',
    tags:['🇺🇸 US History'], quizKey:'q_hist_modern',
    fr:`<h3>🌍 Les USA Modernes — 20e et 21e Siècles</h3>
<h4>2ème Guerre Mondiale (1939-1945)</h4>
<div class="example-box"><div class="ex-label">⚡ Rôle Américain</div>Pearl Harbor (Dec 7, 1941) → USA entre en guerre. D-Day (June 6, 1944) → Libération de l'Europe. Bombes atomiques sur Hiroshima et Nagasaki (Aug 1945) → capitulation japonaise. Les USA = superpuissance mondiale après 1945.</div>
<h4>Guerre Froide (1947-1991)</h4>
<div class="example-box"><div class="ex-label">🚀 USA vs URSS</div>Course aux armements (bombes nucléaires), course à l'espace (Spoutnik 1957, Lune 1969!), proxy wars (Corée, Vietnam, Angola...). Chute du mur de Berlin 1989 → fin de l'URSS 1991 → USA = seule superpuissance</div>
<h4>Tournants Récents</h4>
<div class="example-box"><div class="ex-label">📅 À Retenir</div>• 2001 (9/11): Attentats → Patriot Act → guerres en Afghanistan et Irak<br/>• 2008: Barack Obama = 1er Président Afro-Américain 🎉 (et 2012!)<br/>• 2020: COVID-19 pandémie + mouvement Black Lives Matter<br/>• 2024: Kamala Harris = 1ère vice-présidente femme et de couleur!</div>
<div class="us-box"><div class="us-label">🇺🇸 USA Today & Immigration</div>The US has always been a "nation of immigrants." Each wave of immigrants (Irish, Italian, Jewish, Latino, Asian, African) has enriched American culture. YOU are part of this ongoing story!</div>`,
    en:`<h3>🌍 Modern US History</h3>
<div class="formula-box">WWII (1941-45) → Cold War (1947-91) → 9/11 (2001) → Obama (2008) → Today</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Place in American History</div>You are arriving at a pivotal moment in American history. The US is becoming more diverse than ever — by 2045, no single racial group will be the majority. Your generation will shape what America becomes. You are not just experiencing history — you are making it.</div>`
  },

  // ══ CIVICS ══
  l_civ_branches: {
    title:'3 Branches du Gouvernement', titleEn:'3 Branches of Government',
    tags:['🇺🇸 Civics','US Government'], quizKey:'q_civ_branches',
    fr:`<h3>🏛️ Les 3 Branches du Gouvernement Américain</h3>
<p>Pour éviter toute concentration du pouvoir (comme sous les rois), la Constitution divise le gouvernement en 3 branches qui se contrôlent mutuellement (<strong>checks and balances</strong>).</p>
<h4>Branche Législative — Fait les Lois</h4>
<div class="formula-box">CONGRÈS = Sénat (100 sénateurs, 2 par État, 6 ans) + Chambre des Représentants (435 membres, 2 ans)</div>
<h4>Branche Exécutive — Applique les Lois</h4>
<div class="formula-box">Président (4 ans, max 2 mandats) + Vice-Président + Cabinet (ministres)</div>
<h4>Branche Judiciaire — Interprète les Lois</h4>
<div class="formula-box">Cour Suprême (9 juges nommés à vie) + Cours fédérales inférieures</div>
<div class="example-box"><div class="ex-label">⚖️ Checks & Balances en Action</div>• Le Président peut <strong>veto</strong> (refuser) une loi du Congrès<br/>• Le Congrès peut passer outre le veto avec 2/3 des votes<br/>• La Cour Suprême peut déclarer une loi <strong>inconstitutionnelle</strong><br/>• Le Sénat confirme (ou refuse) les nominations du Président</div>
<div class="us-box"><div class="us-label">🇺🇸 Why Immigrants Should Know This</div>Immigration laws are made by Congress and enforced by the Executive branch (USCIS, ICE). Courts can challenge enforcement. Knowing who makes the rules helps you know who to petition, contact, or vote for when you're 18!</div>`,
    en:`<h3>🏛️ 3 Branches of Government</h3>
<div class="formula-box">Legislative (Congress) → makes laws | Executive (President) → enforces laws | Judicial (Supreme Court) → interprets laws</div>
<div class="us-box"><div class="us-label">🇺🇸 Citizenship Test Preview</div>Q: "What are the two parts of Congress?" A: Senate and House of Representatives. Q: "How many justices are on the Supreme Court?" A: Nine. These are real citizenship test questions — learn them now!</div>`
  },
  l_civ_rights: {
    title:'Droits & Libertés', titleEn:'Rights & Freedoms in the US',
    tags:['🇺🇸 Civics','Vos Droits'], quizKey:'q_civ_rights',
    fr:`<h3>⚖️ Tes Droits aux USA — Ce Que Tu Dois Absolument Savoir</h3>
<p>Les <strong>10 premiers amendements</strong> (Bill of Rights, 1791) protègent tes libertés fondamentales contre le gouvernement.</p>
<h4>Les Amendements Clés</h4>
<div class="example-box"><div class="ex-label">📋 Tes Droits Fondamentaux</div>• <strong>1er Amendement</strong>: Parole libre, religion libre, presse libre, manifestation pacifique<br/>• <strong>4e</strong>: Pas de fouille ou arrestation sans "probable cause" (raison valide)<br/>• <strong>5e</strong>: Droit au silence ("Je plaide le 5e Amendement" = refus de témoigner contre soi-même)<br/>• <strong>6e</strong>: Droit à un avocat (GRATUIT si tu n'as pas les moyens!) + procès rapide<br/>• <strong>8e</strong>: Pas de punition cruelle ou inhabituelle<br/>• <strong>14e</strong>: Égale protection sous la loi → s'applique à TOI même sans statut légal!</div>
<h4>Tes Droits avec la Police</h4>
<div class="example-box"><div class="ex-label">🚔 Si la Police t'Arrête</div>1. "Am I free to go?" (Suis-je libre de partir?)<br/>2. "I am exercising my right to remain silent." (Je reste silencieux/silencieuse)<br/>3. "I want a lawyer." (Je veux un avocat)<br/>Ces 3 phrases peuvent te protéger dans n'importe quelle situation!</div>
<div class="us-box"><div class="us-label">🇺🇸 Rights in US Schools</div>In US schools: you have freedom of expression (within school rules), privacy rights, rights against discrimination, and the right to religious expression. If you feel your rights are violated, contact your school counselor or the ACLU (aclu.org).</div>`,
    en:`<h3>⚖️ Your Rights in the US</h3>
<div class="formula-box">1st: Free speech/religion | 4th: No unreasonable searches | 5th: Right to silence | 6th: Right to lawyer</div>
<div class="us-box"><div class="us-label">🇺🇸 3 Sentences That Protect You</div>1. "Am I free to go?" 2. "I am exercising my right to remain silent." 3. "I want a lawyer." Know and use these if needed. These rights apply to EVERYONE in the US regardless of immigration status.</div>`
  },
  l_civ_vote: {
    title:'Vote & Démocratie', titleEn:'Voting & American Democracy',
    tags:['🇺🇸 Civics'], quizKey:'q_civ_vote',
    fr:`<h3>🗳️ La Démocratie Américaine et le Vote</h3>
<p>Les USA sont une <strong>démocratie représentative constitutionnelle</strong>: les citoyens élisent des représentants qui gouvernent selon la Constitution.</p>
<h4>Comment Fonctionne le Vote</h4>
<div class="example-box"><div class="ex-label">📅 Types d'Élections</div>• <strong>Présidentielle</strong>: tous les 4 ans (prochain: nov. 2028)<br/>• <strong>Mid-term elections</strong>: tous les 2 ans (Congrès)<br/>• <strong>Locales</strong>: maires, juges, shérifs, membres du conseil scolaire → impactent ta vie DIRECTEMENT!<br/>• <strong>Primary</strong>: vote interne des partis pour choisir leur candidat</div>
<h4>L'Electoral College — Système Unique</h4>
<div class="formula-box">270 votes électoraux nécessaires (sur 538 total) pour gagner la Présidence<br/>Chaque État = nombre de votes = représentants + 2 sénateurs</div>
<div class="example-box"><div class="ex-label">📋 Comment S'inscrire pour Voter</div>À 18 ans: voter registration (inscription) → en ligne, par courrier, ou au DMV. Registre au moins 30 jours avant l'élection (varie par État). Bonne nouvelle: certains États permettent désormais l'inscription le jour J!</div>
<div class="us-box"><div class="us-label">🇺🇸 Voting at 18 — Plan Now!</div>In 5 years you could be eligible to vote (as a citizen or when you naturalize). Elections about education, healthcare, immigration, and climate affect YOU. Local school board elections determine your school's curriculum and budget. Every vote counts!</div>`,
    en:`<h3>🗳️ Voting & Democracy</h3>
<div class="formula-box">Register → Vote (18+ citizens) → 270 Electoral College votes wins presidency</div>
<div class="us-box"><div class="us-label">🇺🇸 Youth Civic Participation</div>Even before you can vote, you can participate in democracy: attend city council meetings, contact representatives, volunteer for campaigns, participate in school government (student council!), and educate others. Democracy needs active participants, not just voters.</div>`
  },

  // ══ COMPUTER SCIENCE ══
  l_cs_algo: {
    title:'Algorithmique & Logique', titleEn:'Algorithms & Computational Thinking',
    tags:['💻 CS','US STEM'], quizKey:'q_cs_algo',
    fr:`<h3>💻 Algorithmique — Penser comme un Ordinateur</h3>
<p>Un <strong>algorithme</strong> est une suite finie et ordonnée d'instructions permettant de résoudre un problème. C'est la base de toute programmation!</p>
<h4>Caractéristiques d'un Bon Algorithme</h4>
<div class="example-box"><div class="ex-label">✅ FIEC</div>• <strong>Fini</strong>: se termine toujours<br/>• <strong>Intelligible</strong>: clair et lisible<br/>• <strong>Efficace</strong>: utilise peu de ressources<br/>• <strong>Correct</strong>: donne le bon résultat</div>
<h4>Structures de Contrôle</h4>
<div class="formula-box">Séquentielle: instruction 1 → 2 → 3<br/>Conditionnelle: SI condition ALORS action1 SINON action2<br/>Répétitive: POUR i de 1 à 10 FAIRE | TANT QUE condition FAIRE</div>
<div class="example-box"><div class="ex-label">🥭 Algorithme: Trouver le Prix Max au Marché</div>max ← prix[0]<br/>POUR chaque prix dans la liste:<br/>  SI prix > max ALORS max ← prix<br/>RETOURNER max</div>
<div class="formula-box">Complexité: O(1) constant | O(n) linéaire | O(n²) quadratique | O(log n) logarithmique</div>
<div class="us-box"><div class="us-label">🇺🇸 CS in US Schools</div>In US middle/high school: CS is now required in many states! Tools used: Scratch (visual), Python, JavaScript. Key vocab: <strong>algorithm, pseudocode, flowchart, sequence, selection (if/else), iteration (loop), variable, input/output, function, debugging, efficiency, computational thinking.</strong></div>`,
    en:`<h3>💻 Algorithms & Computational Thinking</h3>
<div class="formula-box">Algorithm = finite, ordered set of instructions to solve a problem</div>
<div class="us-box"><div class="us-label">🇺🇸 CS Career Outlook</div>Software engineers are the #1 highest-paid profession in the US. Average salary: $120,000+/year. Google, Apple, Amazon, Microsoft all need more engineers than they can find. Learning CS now = opening the door to incredible opportunities. CS + your math skills = unstoppable!</div>`
  },
  l_cs_python: {
    title:'Python — Initiation', titleEn:'Python Programming Basics',
    tags:['💻 CS','Python','US STEM'], quizKey:'q_cs_python',
    fr:`<h3>🐍 Python — Ton Premier Langage de Programmation</h3>
<p>Python est le langage le plus utilisé en Data Science, IA, et biologie computationnelle. Simple, gratuit, et puissant — parfait pour débuter!</p>
<h4>Variables et Types</h4>
<div class="formula-box">x = 5 (integer) | prix = 3.50 (float) | nom = "Amina" (string) | vrai = True (boolean)</div>
<h4>Conditions</h4>
<div class="formula-box">if prix > 100:<br/>    print("Trop cher!")<br/>elif prix > 50:<br/>    print("Moyen")<br/>else:<br/>    print("Bon prix!")</div>
<h4>Boucles</h4>
<div class="formula-box">for i in range(5):  # 0,1,2,3,4<br/>    print(i)<br/><br/>while compteur &lt; 10:<br/>    compteur += 1</div>
<h4>Fonctions</h4>
<div class="formula-box">def calcul_prix(quantite, prix_unitaire):<br/>    return quantite * prix_unitaire<br/><br/>total = calcul_prix(4, 200)  # 800</div>
<div class="example-box"><div class="ex-label">🥭 Calculateur de Marché en Python</div>mangues = int(input("Combien de mangues? "))<br/>prix_unitaire = 200  # FCFA<br/>total = mangues * prix_unitaire<br/>print(f"Total: {total} FCFA")</div>
<div class="us-box"><div class="us-label">🇺🇸 Free Python Resources</div>code.org, codecademy.com/learn/learn-python-3, learnpython.org — all free! MESA programs (in US schools) teach Python. Python is used at Google, Netflix, NASA, Instagram, Spotify. Start now with small projects!</div>`,
    en:`<h3>🐍 Python Basics</h3>
<div class="formula-box">Variables | if/elif/else | for/while loops | def functions | print() | input()</div>
<div class="example-box"><div class="ex-label">🖥️ Hello World + More</div>print("Hello, World!")  # Your first program!<br/>name = input("What's your name? ")<br/>print(f"Hello, {name}! Welcome to Python!")</div>
<div class="us-box"><div class="us-label">🇺🇸 Python Projects to Build Your Portfolio</div>Simple calculator, grade calculator, weather app (using API), quiz game, password generator, data visualizer (matplotlib). Portfolios on GitHub impress college admissions AND employers!</div>`
  },
  l_cs_net: {
    title:'Internet & Cybersécurité', titleEn:'Internet & Cybersecurity',
    tags:['💻 CS','Digital Safety'], quizKey:'q_cs_net',
    fr:`<h3>🌐 Comment Fonctionne Internet</h3>
<p>Internet est un réseau mondial de milliards d'appareils qui communiquent via des protocoles standardisés.</p>
<h4>Architecture de Base</h4>
<div class="formula-box">Client → Requête HTTP/HTTPS → Serveur → Réponse (page web, données)<br/>DNS: traduit "google.com" en adresse IP (142.250.185.78)</div>
<h4>Cybersécurité — Protège-toi!</h4>
<div class="example-box"><div class="ex-label">🔒 Règles d'Or</div>• Mot de passe fort: 12+ caractères, majuscules+chiffres+symboles<br/>• 2FA (authentification à 2 facteurs): TOUJOURS activer sur tes comptes importants<br/>• Phishing: ne jamais cliquer sur liens suspects dans les emails<br/>• Wi-Fi public: jamais de transactions bancaires sur Wi-Fi non sécurisé<br/>• VPN: protège ton trafic internet sur réseaux publics<br/>• Données personnelles: lis les permissions avant d'installer une app!</div>
<div class="example-box"><div class="ex-label">⚠️ Dangers pour les Adolescents</div>• Cyberbullying (cyberharcèlement): signaler immédiatement au counselor<br/>• Grooming (manipulation en ligne par adultes): ne jamais rencontrer des inconnus seule<br/>• Sexting: illégal pour les mineurs, irréversible une fois envoyé<br/>• Identity theft: ne jamais partager SSN, données bancaires</div>
<div class="us-box"><div class="us-label">🇺🇸 Digital Citizenship in US Schools</div>US schools teach digital citizenship: responsible use of technology, copyright, privacy, cyberbullying prevention. Key vocab: <strong>cybersecurity, encryption, firewall, VPN, phishing, malware, identity theft, digital footprint, privacy settings, two-factor authentication.</strong></div>`,
    en:`<h3>🌐 Internet & Cybersecurity</h3>
<div class="formula-box">HTTP/HTTPS | DNS | IP Address | Encryption | Firewall | VPN | 2FA</div>
<div class="us-box"><div class="us-label">🇺🇸 Cyber Career Opportunities</div>Cybersecurity is one of the FASTEST-growing and highest-paying fields in tech. 3.5 million unfilled cybersecurity jobs globally! Average US salary: $95,000-$160,000. The US needs diverse cyber professionals urgently.</div>`
  },
  l_cs_ai: {
    title:'Intelligence Artificielle', titleEn:'Artificial Intelligence Basics',
    tags:['💻 CS','IA','Future Tech'], quizKey:'q_cs_ai',
    fr:`<h3>🤖 L'Intelligence Artificielle — Ton Futur</h3>
<p>L'IA est la capacité des machines à imiter des comportements intelligents humains. C'est la révolution technologique la plus importante de notre époque!</p>
<h4>Types d'IA</h4>
<div class="example-box"><div class="ex-label">🧠 Niveaux d'IA</div>• <strong>IA Étroite</strong> (Narrow AI): spécialisée (reconnaissance visage, traduction, jeux d'échecs)<br/>• <strong>IA Générale</strong> (AGI): intelligence comparable à l'humain (pas encore atteinte)<br/>• <strong>IA Super</strong> (ASI): surpasse l'intelligence humaine (futur hypothétique)</div>
<h4>Machine Learning</h4>
<div class="formula-box">Données → Entraînement (algorithme) → Modèle → Prédictions sur nouvelles données</div>
<div class="example-box"><div class="ex-label">🤖 ARIA = IA dans Cette App!</div>Cette app utilise Claude (Anthropic) — un Large Language Model (LLM) entraîné sur des milliards de textes. Le modèle apprend des patterns dans le langage pour générer des réponses cohérentes. Ce n'est pas de la "vraie" compréhension — c'est de la reconnaissance de patterns très sophistiquée!</div>
<h4>Éthique de l'IA</h4>
<div class="example-box"><div class="ex-label">⚠️ Problèmes à Résoudre</div>Biais algorithmiques (IA qui discrimine les minorités!), désinformation deepfakes, perte d'emplois, vie privée, armement autonome → Les futurs ingénieurs DOIVENT penser à l'éthique!</div>
<div class="us-box"><div class="us-label">🇺🇸 AI Careers</div>AI engineers, ML researchers, data scientists, AI ethicists, AI policy makers — all needed URGENTLY. Companies: Google DeepMind, OpenAI, Anthropic (makes this app!), Meta AI, Apple, Amazon. Average ML engineer salary: $150,000+/year.</div>`,
    en:`<h3>🤖 AI & Machine Learning</h3>
<div class="formula-box">Data → Training → Model → Predictions | Types: Narrow AI → General AI → Superintelligence</div>
<div class="us-box"><div class="us-label">🇺🇸 AI & Your Future</div>Every STEM career will be transformed by AI. Doctors will use AI for diagnosis. Engineers will use AI for design. Scientists will use AI to analyze data. Your job: understand AI well enough to USE it, EVALUATE it, and IMPROVE it — not just consume it. That's what separates STEM leaders from followers.</div>`
  },

  // ══ HEALTH ══
  l_hlth_nutr: {
    title:'Nutrition & Alimentation', titleEn:'Nutrition & Healthy Eating',
    tags:['🫀 Health','US 8th Grade'], quizKey:'q_hlth_nutr',
    fr:`<h3>🥗 Nutrition — Mange bien pour étudier mieux!</h3>
<p>Une bonne nutrition booste ta concentration, ta mémoire, et tes notes. La science le prouve!</p>
<h4>Les Macronutriments</h4>
<div class="example-box"><div class="ex-label">🔑 Macro = Grande quantité</div>• <strong>Glucides</strong> (carbs): énergie principale (riz, pain, fruits). 45-65% des calories<br/>• <strong>Protéines</strong>: construction musculaire et cellulaire (viande, œufs, légumineuses). 10-35%<br/>• <strong>Lipides</strong> (graisses): énergie, hormones, absorption vitamines. 20-35%</div>
<h4>Micronutriments Essentiels</h4>
<div class="example-box"><div class="ex-label">💊 Vitamines et Minéraux</div>• Fer: globules rouges (viande rouge, légumes verts, ndolé!). Carence → anémie<br/>• Calcium: os et dents (lait, fromage, brocoli). Crucial à ton âge!<br/>• Vitamine D: absorption calcium, immunité (soleil, poisson, œufs)<br/>• Vitamine C: immunité (citron, orange, mangue!)</div>
<h4>MyPlate — Assiette Américaine</h4>
<div class="formula-box">½ assiette Fruits/Légumes + ¼ Protéines + ¼ Céréales complètes + Produits laitiers côté</div>
<div class="us-box"><div class="us-label">🇺🇸 Eating in the US</div>US food portions are LARGE. Processed food is everywhere. School lunch varies by school — you can bring your own food. Key vocab: <strong>nutrients, calories, macronutrients, vitamins, minerals, hydration, food groups, serving size, nutrition label, protein, carbohydrates, fats.</strong><br/>Drink water! Most US students are chronically dehydrated.</div>`,
    en:`<h3>🥗 Nutrition</h3>
<div class="formula-box">Macros: Carbs (energy) + Proteins (building) + Fats (hormones, vitamins). Drink 8 glasses water/day.</div>
<div class="us-box"><div class="us-label">🇺🇸 US School Lunch</div>US schools often offer free or reduced-price lunch (Free/Reduced Lunch program) based on family income. ALWAYS apply if eligible — no shame, it's a right! Healthy eating directly improves memory, concentration, and test scores.</div>`
  },
  l_hlth_first: {
    title:'Premiers Secours', titleEn:'First Aid & Emergency Response',
    tags:['🫀 Health','Safety'], quizKey:'q_hlth_first',
    fr:`<h3>🚑 Premiers Secours — Savoir Peut Sauver Une Vie!</h3>
<p>Aux USA, savoir les premiers secours est une compétence citoyenne. Beaucoup d'écoles l'enseignent obligatoirement.</p>
<h4>Numéros d'Urgence Essentiels</h4>
<div class="formula-box">🇺🇸 USA: 911 (police + pompiers + ambulance) | Poison Control: 1-800-222-1222<br/>🇨🇲 Cameroun: Police 17 | SAMU 15 | Pompiers 18</div>
<h4>RCP (CPR) — Réanimation Cardio-Pulmonaire</h4>
<div class="example-box"><div class="ex-label">❤️ Protocole CPR (personnes non formées)</div>1. Vérifie la sécurité de la scène<br/>2. Appelle le 911 immédiatement (ou demande à quelqu'un)<br/>3. 30 compressions thoraciques: mains sur sternum, enfonce 5cm, 100-120/min<br/>4. 2 insufflations (si formé)<br/>5. Continue jusqu'à l'arrivée des secours</div>
<h4>Règle FAST — Reconnaître un AVC</h4>
<div class="formula-box">F = Face (visage asymétrique?) A = Arms (un bras tombe?) S = Speech (parole confuse?) T = Time → appeler 911 IMMÉDIATEMENT!</div>
<div class="example-box"><div class="ex-label">🔥 Règles Simples</div>• Brûlure: eau froide 10 minutes, JAMAIS de beurre, de pâte dentifrice, d'huile<br/>• Saignement: comprimer avec tissu propre, lever le membre si possible<br/>• Étouffement adulte: Heimlich (mains entre nombril et sternum, compressions rapides)<br/>• Ne jamais bouger une personne blessée à la colonne!</div>
<div class="us-box"><div class="us-label">🇺🇸 First Aid in US Schools</div>Many US schools teach CPR + AED use. AEDs (Automated External Defibrillators) are in every US school. The Red Cross offers free first aid classes. Get certified — it's a valuable skill for any STEM career (especially medicine, nursing, engineering).</div>`,
    en:`<h3>🚑 First Aid</h3>
<div class="formula-box">911 (US emergency) | CPR: 30 chest compressions + 2 breaths | FAST for stroke</div>
<div class="us-box"><div class="us-label">🇺🇸 Be Prepared at Your US School</div>Know where the AED (defibrillator) is in your school. Know evacuation routes. Know the nearest hospital. In the US, calling 911 is free and you cannot get in trouble for calling it if you genuinely believe there's an emergency.</div>`
  },
  l_hlth_teen: {
    title:'Adolescence & Développement', titleEn:'Adolescence & Teen Health',
    tags:['🫀 Health','Bien-être Ado'], quizKey:'q_hlth_teen',
    fr:`<h3>🌸 L'Adolescence — Comprendre Ton Corps</h3>
<p>La puberté est une transition naturelle et universelle. Comprendre ce qui se passe dans ton corps t'aide à prendre soin de toi!</p>
<h4>Changements Physiques (Filles)</h4>
<div class="example-box"><div class="ex-label">🌿 Puberty for Girls</div>• Âge moyen: 8-13 ans (début), se termine ~16-17 ans<br/>• Développement de la poitrine, poils axillaires et pubiens<br/>• Croissance rapide (pic de croissance: +8-10 cm/an)<br/>• Premières menstruations (ménarche): 11-15 ans en moyenne<br/>• Hanche s'élargit (préparation à la maternité future)</div>
<h4>Cycle Menstruel</h4>
<div class="formula-box">Cycle moyen: 28 jours (21-35 = normal) | Durée: 3-7 jours<br/>Apps utiles: Clue, Flo (suivi gratuit, privé)</div>
<h4>Sommeil — Pas Négociable!</h4>
<div class="example-box"><div class="ex-label">😴 Le Sommeil des Ados</div>Besoin: 8-10 heures par nuit (ton cerveau se développe pendant le sommeil!)<br/>Manque de sommeil → concentration réduite, mémoire affaiblie, irritabilité, mauvais résultats scolaires<br/>Conseil: pas d'écran 1h avant de dormir (la lumière bleue bloque la mélatonine)</div>
<div class="us-box"><div class="us-label">🇺🇸 Teen Health in the US</div>In US Health class you'll discuss: puberty, reproductive health, mental health, nutrition, exercise, substance avoidance, and healthy relationships. Your school has a nurse (infirmière) who can answer private questions confidentially. Female gynecologist visits recommended starting 13-15.</div>`,
    en:`<h3>🌸 Teen Health & Adolescence</h3>
<div class="us-box"><div class="us-label">🇺🇸 Health Resources at Your School</div>US schools have nurses, counselors, and health educators. Everything you tell them is CONFIDENTIAL (private). They can help with: period concerns, mental health, nutrition questions, and more. You are never alone. Ask for help — that's what these resources are for!</div>`
  },

  // ══ FINANCE ══
  l_fin_bank: {
    title:'Compte Bancaire & Banque', titleEn:'Banking Basics',
    tags:['💰 Finance','US Life'], quizKey:'q_fin_bank',
    fr:`<h3>🏦 La Banque aux USA</h3>
<p>Comprendre la banque aux USA est indispensable pour gérer ton argent intelligemment dès ton arrivée!</p>
<h4>Types de Comptes</h4>
<div class="example-box"><div class="ex-label">💳 Checking vs Savings</div>• <strong>Checking Account</strong> (courant): pour dépenses quotidiennes, payer en ligne, chèques<br/>• <strong>Savings Account</strong> (épargne): pour épargner, rapporte des intérêts (~0.5-5%/an)<br/>• Garde séparés: l'un pour dépenser, l'autre pour économiser!</div>
<h4>Vocabulaire Bancaire Essentiel</h4>
<div class="example-box"><div class="ex-label">📚 Terms to Know</div>• <strong>Routing Number</strong>: identifie la banque (9 chiffres)<br/>• <strong>Account Number</strong>: identifie TON compte (8-12 chiffres)<br/>• <strong>Direct Deposit</strong>: salaire déposé automatiquement<br/>• <strong>Overdraft</strong>: dépenser plus que son solde → frais! Éviter absolument<br/>• <strong>APR</strong>: Annual Percentage Rate (taux d'intérêt annuel)<br/>• <strong>FDIC Insured</strong>: ton argent protégé jusqu'à $250,000 si la banque ferme!</div>
<h4>Débit vs Crédit</h4>
<div class="formula-box">Débit = TON argent (immédiat) | Crédit = EMPRUNT à rembourser (+ intérêts si pas payé à temps!)</div>
<div class="us-box"><div class="us-label">🇺🇸 Banking for Immigrants</div>Good options without SSN: Chime (digital, no fees), Bank of America, local Credit Unions. Documents needed: passport, ITIN (Individual Taxpayer ID), proof of address. Open an account ASAP when you arrive — it's safer than cash and builds your financial profile.</div>`,
    en:`<h3>🏦 Banking in the US</h3>
<div class="formula-box">Checking Account (spend) + Savings Account (save) | Debit = your money | Credit = borrowed money</div>
<div class="us-box"><div class="us-label">🇺🇸 Building Credit (Start Now!)</div>In the US, your credit score (300-850) determines if you can rent an apartment, buy a car, get a loan. Start building credit early: secured credit card, become an authorized user on parents' card, pay ALL bills on time. Good credit = financial freedom.</div>`
  },
  l_fin_budget: {
    title:'Budget & Épargne', titleEn:'Budgeting & Saving Money',
    tags:['💰 Finance'], quizKey:'q_fin_budget',
    fr:`<h3>💸 Gérer son Argent — Le Budget</h3>
<p>Savoir gérer son argent est une des compétences les plus importantes de ta vie. Et elle ne s'enseigne pas assez à l'école!</p>
<h4>La Règle 50/30/20</h4>
<div class="formula-box">50% des revenus → BESOINS (loyer, nourriture, transport)<br/>30% des revenus → ENVIES (sorties, vêtements, loisirs)<br/>20% des revenus → ÉPARGNE + remboursement dettes</div>
<div class="example-box"><div class="ex-label">👩‍🎓 Budget d'une Lycéenne</div>Amina gagne $120/mois en babysitting:<br/>• Besoins (fournitures, transport): $60 (50%)<br/>• Envies (sorties, vêtements): $36 (30%)<br/>• Épargne (fonds universite!): $24 (20%) → $288/an → sur 5 ans: $1,440!</div>
<h4>Fonds d'Urgence</h4>
<div class="formula-box">Objectif: 3-6 mois de dépenses en réserve | Intouchable sauf vraie urgence</div>
<h4>Objectifs SMART</h4>
<div class="example-box"><div class="ex-label">🎯 S.M.A.R.T.</div>Spécifique, Mesurable, Atteignable, Réaliste, Temporel<br/>❌ "Je veux économiser." → ✅ "Je vais économiser $50/mois pour un laptop d'ici 6 mois."</div>
<div class="us-box"><div class="us-label">🇺🇸 US Financial Tools</div>Free budgeting apps: Mint, YNAB (free for students), bank apps. The US has a serious lack of financial literacy education — most young adults graduate without basic money skills. You're ahead of the curve by learning this now!</div>`,
    en:`<h3>💸 Budgeting</h3>
<div class="formula-box">50/30/20 Rule: 50% Needs + 30% Wants + 20% Savings | SMART Goals: Specific, Measurable, Achievable, Relevant, Time-bound</div>
<div class="us-box"><div class="us-label">🇺🇸 Compound Interest — The 8th Wonder</div>Albert Einstein called compound interest "the eighth wonder of the world." If you save $100/month starting at 13 at 7% annual return, by age 65 you'll have $638,000. The earlier you start, the more powerful it becomes. Start your savings habit NOW.</div>`
  },
  l_fin_schol: {
    title:'Bourses d\'Études', titleEn:'Scholarships & College Financial Aid',
    tags:['💰 Finance','College Prep'], quizKey:'q_fin_schol',
    fr:`<h3>🎓 Les Bourses d'Études — Ton Accès à l'Université</h3>
<p>L'université américaine peut coûter $30,000-$75,000/an. Mais avec les aides financières disponibles, beaucoup d'élèves méritants ne paient rien!</p>
<h4>Types d'Aides Financières</h4>
<div class="example-box"><div class="ex-label">💰 4 Types d'Aide</div>• <strong>Grant</strong>: argent GRATUIT (ne pas rembourser!). Ex: Pell Grant (jusqu'à $7,395/an)<br/>• <strong>Scholarship</strong>: basée sur le mérite (notes, activités). Ne pas rembourser!<br/>• <strong>Work-Study</strong>: travail à temps partiel sur campus (~$3,000-5,000/an)<br/>• <strong>Loan</strong>: emprunt à rembourser avec intérêts après graduation. Éviter si possible!</div>
<h4>FAFSA — La Clé de Tout</h4>
<div class="formula-box">Free Application for Federal Student Aid | Ouvre: 1er octobre de ta terminale<br/>À remplir chaque année | Détermine toutes tes aides fédérales</div>
<h4>Construire ton Profil Dès Maintenant</h4>
<div class="example-box"><div class="ex-label">🏆 Scholarship Checklist (Commence Maintenant!)</div>✅ GPA fort (vise 3.7+)<br/>✅ 2-3 clubs parascolaires (STEM si possible!)<br/>✅ Bénévolat communautaire (20+ heures/an)<br/>✅ Leadership: sois présidente d'un club<br/>✅ Essays: ton histoire Cameroun→USA est UNIQUE et puissante<br/>✅ Lettres de recommandation: soigne tes relations avec les profs dès maintenant</div>
<div class="us-box"><div class="us-label">🇺🇸 Scholarships for You Specifically!</div>Scholarships exist for: STEM girls, African students, immigrants, first-generation college students, and bilingual students. Search on: fastweb.com, scholarships.com, collegeboard.org, and your state's education website. Some scholarship deadlines start in 9th grade — don't wait!</div>`,
    en:`<h3>🎓 Scholarships & Financial Aid</h3>
<div class="formula-box">Grant (free) + Scholarship (merit, free) + Work-Study + Loans = Financial Aid Package</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Story = Your Scholarship Advantage</div>"Bilingual student from Cameroon pursuing STEM to solve Africa's climate challenges" — that story wins scholarships. Be authentic, be specific about your goals, and connect your background to your future impact. Scholarship committees are looking for students like you!</div>`
  },

  // ══ ART ══
  l_art_hist: {
    title:'Histoire de l\'Art', titleEn:'Art History Overview',
    tags:['🎨 Arts','US 8th Grade'], quizKey:'q_art_hist',
    fr:`<h3>🎨 Histoire de l'Art — De la Préhistoire à Aujourd'hui</h3>
<h4>Grandes Périodes</h4>
<div class="example-box"><div class="ex-label">🖼️ Chronologie Artistique</div>• <strong>Préhistoire</strong>: peintures rupestres (Lascaux, 17 000 ans), art pariétal<br/>• <strong>Antiquité</strong>: art grec (idéal du corps parfait), art égyptien (hiérarchie des tailles)<br/>• <strong>Renaissance (1400-1600)</strong>: Léonard da Vinci (Mona Lisa), Michel-Ange (Sixtine), Raphaël<br/>• <strong>Impressionnisme (1860s-)</strong>: Monet (nénuphars), Renoir → capturer la lumière et l'instant<br/>• <strong>Art Moderne (1900s)</strong>: Picasso (Cubisme), Kandinsky (Abstrait), Warhol (Pop Art)<br/>• <strong>Art Contemporain</strong>: conceptuel, installation, numérique, Street Art</div>
<h4>Art Africain Classique</h4>
<div class="example-box"><div class="ex-label">🌍 Le Cameroun dans l'Histoire de l'Art</div>• <strong>Masques Bamiléké</strong>: masques-éléphants ornés de perles, symboles de royauté<br/>• <strong>Bronzes Banum</strong>: art de la cour des sultans de Foumban<br/>• <strong>Cases décorées</strong>: architecture traditionnelle des chefferies<br/>Savoir-faire: Le Cubisme de Picasso a été DIRECTEMENT inspiré par l'art africain! (musée du Trocadéro, Paris, 1907)</div>
<div class="us-box"><div class="us-label">🇺🇸 Art in US Schools</div>Art History is often integrated into US History and English classes. Major US museums: Met (NYC), MoMA (NYC), Art Institute (Chicago), Getty (LA). Key terms: <strong>style, medium, composition, perspective, symmetry, abstract, figurative, sculpture, photography, digital art.</strong></div>`,
    en:`<h3>🎨 Art History</h3>
<div class="example-box"><div class="ex-label">🌍 Africa's Influence on Modern Art</div>Picasso saw African masks at the Trocadéro museum in 1907 and it transformed his art. "Les Demoiselles d'Avignon" (1907) — one of the most influential paintings in history — was directly inspired by African art. African art CREATED modern art!</div>
<div class="us-box"><div class="us-label">🇺🇸 Artists of Color in US</div>Jean-Michel Basquiat (Haitian-American), Kerry James Marshall, Kehinde Wiley (painted Obama's official portrait!), Alma Thomas — major African-American artists whose work you'll study in US art classes.</div>`
  },
  l_art_music: {
    title:'Musique Américaine', titleEn:'American Music & African Roots',
    tags:['🎨 Arts','Culture'], quizKey:'q_art_music',
    fr:`<h3>🎵 La Musique Américaine — Racines Africaines</h3>
<p>Incroyable mais vrai: tout ce que les gens appellent "musique américaine" a des racines africaines profondes!</p>
<h4>Généalogie de la Musique Américaine</h4>
<div class="formula-box">Musique Africaine (rythmes, call-and-response, improvisation)<br/>→ Negro Spirituals + Work Songs (esclavage)<br/>→ Blues (1900s, Sud rural) → Jazz (1920s, New Orleans)<br/>→ R&B/Soul (1950-60s) → Rock'n'Roll → Hip-Hop (1970s) → Tout aujourd'hui!</div>
<div class="example-box"><div class="ex-label">🌟 Géants de la Musique</div>• <strong>Blues</strong>: Robert Johnson, Muddy Waters (origines congolaises traced!)<br/>• <strong>Jazz</strong>: Louis Armstrong, Miles Davis, John Coltrane<br/>• <strong>Soul</strong>: Aretha Franklin ("Queen of Soul"), James Brown ("Godfather of Soul")<br/>• <strong>Hip-Hop</strong>: né dans le Bronx (New York) dans la communauté afro-américaine et caribéenne<br/>• <strong>Afrobeats</strong>: Burna Boy, WizKid, Davido — musique africaine conquiert le monde!</div>
<div class="example-box"><div class="ex-label">🇨🇲 Musique Camerounaise</div>Makossa (Manu Dibango), Bikutsi (Lapiro de Mbanga), Afrobeat et hip-hop camerounais. La musique camerounaise fait partie de la diaspora musicale africaine!</div>
<div class="us-box"><div class="us-label">🇺🇸 Music Appreciation in US Class</div>You'll study: historical context of music, music theory basics, listening analysis. Key terms: <strong>rhythm, melody, harmony, genre, blues scale, improvisation, jazz, soul, hip-hop, cultural exchange.</strong></div>`,
    en:`<h3>🎵 Music: African Roots of American Culture</h3>
<div class="formula-box">Africa → Blues → Jazz → R&B/Soul → Rock → Hip-Hop → ALL modern music</div>
<div class="us-box"><div class="us-label">🇺🇸 Your Cultural Currency</div>As an African student in the US, you carry musical traditions that literally built American popular culture. When Americans listen to jazz, R&B, hip-hop, or pop — they're listening to African-derived music. You are part of that heritage. Be proud of it.</div>`
  },
  l_art_africa: {
    title:'Arts Africains & Diaspora', titleEn:'African Arts & Diaspora',
    tags:['🎨 Arts','Identité'], quizKey:'q_art_africa',
    fr:`<h3>🌍 Arts Africains — Un Patrimoine Mondial</h3>
<p>L'art africain est l'un des plus riches et influents au monde. Ton patrimoine camerounais est une richesse artistique inestimable!</p>
<h4>Arts Camerounais</h4>
<div class="example-box"><div class="ex-label">🎭 Patrimoine Bamiléké</div>• <strong>Masques-éléphants</strong>: couverts de perles (odontol), réservés à la royauté<br/>• <strong>Statuaires</strong>: ancêtres divinisés, gardiens des familles<br/>• <strong>Textiles</strong>: kaba ngondo, vêtements de cour brodés<br/>• <strong>Architecture</strong>: cases rondes décorées, palais des chefferies (patrimoine UNESCO)<br/>• <strong>Bronzes Banum</strong>: sculptures de la cour du Sultan Ibrahim Njoya</div>
<h4>L'Art Africain dans les Musées du Monde</h4>
<div class="example-box"><div class="ex-label">⚠️ Questions de Restitution</div>Beaucoup d'oeuvres africaines ont été pillées pendant la colonisation. Elles se trouvent dans des musées européens et américains: British Museum (Londres), Louvre (Paris), Metropolitan Museum (New York). La restitution est un débat majeur aujourd'hui. Tu peux en parler dans tes essays américains!</div>
<h4>Art de la Diaspora Africaine</h4>
<div class="example-box"><div class="ex-label">🌟 Artistes Contemporains</div>Kehinde Wiley (peintre du portrait officiel d'Obama, né à Los Angeles, racines nigérianes), El Anatsui (sculpteur ghanéen, exposé partout dans le monde), Kara Walker (silhouettes, histoire de l'esclavage)</div>
<div class="us-box"><div class="us-label">🇺🇸 African Art in US Museums</div>In the US, you can see African art at: the Brooklyn Museum (NYC), National Museum of African Art (Washington DC — free admission!), the Met, and many others. These are FREE field trips your school may organize!</div>`,
    en:`<h3>🌍 African Arts</h3>
<div class="us-box"><div class="us-label">🇺🇸 Your Art = Your Identity</div>Don't leave your Cameroonian artistic heritage behind when you move to the US. Share it! Bring traditional crafts to show-and-tell. Write about Bamiléké art in your essays. Teach your American friends about African music and dance. Your culture is not a barrier — it's a bridge that makes you uniquely valuable in diverse American schools.</div>`
  },

  // ══ FRENCH ══
  l_fr_gram: {
    title:'Rédaction & Grammaire Avancée', titleEn:'French Writing — Your Secret Weapon',
    tags:['🗼 Français','Avantage'], quizKey:'q_fr_gram',
    fr:`<h3>✍️ Maîtrise ton Français — Ton Super-Pouvoir!</h3>
<p>Ton niveau de français est un atout extraordinaire aux USA. Voici comment l'affiner au niveau lycée/université.</p>
<h4>Méthode de Dissertation (Plan Dialectique)</h4>
<div class="formula-box">THÈSE (affirme une idée) → ANTITHÈSE (nuance/contredit) → SYNTHÈSE (dépasse les deux)</div>
<h4>Connecteurs Logiques Avancés</h4>
<div class="example-box"><div class="ex-label">📝 Connecteurs par Fonction</div>• <strong>Argumentation</strong>: en effet, par conséquent, c'est pourquoi, ainsi<br/>• <strong>Concession</strong>: certes, il est vrai que, bien que + subj., même si<br/>• <strong>Opposition</strong>: or, cependant, néanmoins, pourtant<br/>• <strong>Illustration</strong>: à titre d'exemple, tel que, notamment, ainsi</div>
<h4>Le Subjonctif — Maîtrise le!</h4>
<div class="formula-box">Après: vouloir que, bien que, pour que, avant que, il faut que...<br/>Ex: "Il faut que tu RÉUSSISSES ton examen." (subj. de réussir)</div>
<div class="us-box"><div class="us-label">🇺🇸 French = Career Asset in the US</div>Bilingual (French+English) professionals earn 5-20% more. International organizations (UN, World Bank, IMF, UNESCO — all based near DC/NYC!) require French. Diplomacy, international law, NGOs, fashion, hospitality, and academia all value French fluency. DELF B2 certification is recognized globally.</div>`,
    en:`<h3>✍️ French Writing = Your Competitive Edge</h3>
<div class="us-box"><div class="us-label">🇺🇸 French in American Universities</div>AP French Language and Culture exam can earn you college credits! Many US universities offer French majors/minors. French literature, business French, international studies — all open to you. The French-English combination is powerful in: law, medicine, diplomacy, NGOs, and international business.</div>`
  },
  l_fr_lit: {
    title:'Littérature Francophone', titleEn:'Francophone Literature',
    tags:['🗼 Français','Littérature'], quizKey:'q_fr_lit',
    fr:`<h3>📚 Littérature Francophone Camerounaise</h3>
<p>Tu appartiens à une riche tradition littéraire. Ces auteurs ont mis le Cameroun sur la carte mondiale de la littérature!</p>
<h4>Auteurs Camerounais Incontournables</h4>
<div class="example-box"><div class="ex-label">📖 Ton Patrimoine Littéraire</div>• <strong>Ferdinand Oyono</strong> (1929-2010): "Une Vie de Boy" (1956) — regard d'un boy sur les colons belges. Chef-d'oeuvre de la littérature anti-coloniale. Ironie, satire.<br/>• <strong>Mongo Beti</strong> (1932-2001): "Mission Terminée" (1957) — critique de la société post-coloniale. Prix Sainte-Beuve 1957!<br/>• <strong>Léonora Miano</strong> (née 1973, Cameroun, vit en France): "L'intérieur de la nuit" — diaspora, identité africaine contemporaine<br/>• <strong>Calixthe Beyala</strong> (née 1961): "Tu t'appelleras Tanga" — condition des femmes africaines</div>
<h4>La Francophonie — Ton Réseau Mondial</h4>
<div class="example-box"><div class="ex-label">🌍 300 Millions de Francophones</div>27 États africains parlent français. 87 pays membres de l'OIF (Organisation Internationale de la Francophonie). Le français = 5ème langue mondiale, en forte croissance grâce à l'Afrique. D'ici 2050, 85% des francophones seront africains!</div>`,
    en:`<h3>📚 Francophone Literature</h3>
<div class="us-box"><div class="us-label">🇺🇸 Francophone Literature in US Universities</div>Many US universities offer courses on Francophone African literature (Oyono, Beti, Beyala, Senghor, Césaire). Your direct connection to this tradition is something no other student can replicate. Mention it in college application essays. It's unique, powerful, and impressive to US admissions officers.</div>`
  },
  l_fr_asset: {
    title:'Le Français comme Atout aux USA', titleEn:'French as Your Career Asset',
    tags:['🗼 Français','Carrières'], quizKey:'q_fr_asset',
    fr:`<h3>🌟 Ton Français = Ton Super-Pouvoir aux USA</h3>
<p>Soyons clairs: ton bilinguisme FR/EN est une richesse exceptionnelle. Voici comment le monétiser!</p>
<h4>Certifications Valorisantes</h4>
<div class="example-box"><div class="ex-label">📜 Certifications à Obtenir</div>• <strong>DELF B2</strong>: Diplôme d'Études en Langue Française — reconnu internationalement, passable aux USA (centres DELF partout). Montre ton niveau professionnel en français<br/>• <strong>DALF C1/C2</strong>: niveau universitaire, très valorisé<br/>• <strong>AP French</strong>: Advanced Placement French en lycée US → crédits universitaires<br/>• <strong>IB French</strong>: si ton école propose le programme International Baccalaureate</div>
<h4>Carrières Utilisant le Français aux USA</h4>
<div class="example-box"><div class="ex-label">💼 Débouchés Concrets</div>• <strong>Diplomatie/État</strong>: Département d'État américain cherche des francophones (ambassades, ONU NY)<br/>• <strong>International Business</strong>: entreprises américaines en Afrique francophone ont besoin de toi!<br/>• <strong>Médecine</strong>: communautés francophones (Louisiane, Québec-border, immigrants africains)<br/>• <strong>Enseignement</strong>: professeur de français = emploi très stable aux USA<br/>• <strong>Journalisme international</strong>: AFP, RFI, TV5Monde recrutent des bilingues<br/>• <strong>ONG/Humanitaire</strong>: MSF, UNICEF, UNHCR travaillent en zones francophones</div>
<div class="us-box"><div class="us-label">🇺🇸 Bilingual Premium</div>Studies show bilingual professionals in the US earn 5-20% more than monolingual counterparts. In international organizations and companies with African operations, French fluency can be the decisive hiring factor. You have an asset — protect and develop it!</div>`,
    en:`<h3>🌟 French = Your Career Superpower</h3>
<div class="us-box"><div class="us-label">🇺🇸 Competitive Advantage</div>Most US-born students speak only English. Your French + English + future career = triple threat. Medical interpreters (French+English for African immigrant patients) are in huge demand. International development, humanitarian aid, global business — all need what you have.</div>`
  },

  // ══ INTEGRATION USA ══
  l_int_social: {
    title:'Vie Sociale Américaine', titleEn:'American Social Life & Culture',
    tags:['🇺🇸 Intégration','Culture'], quizKey:'q_int_social',
    fr:`<h3>🤝 Comprendre la Culture Sociale Américaine</h3>
<p>Les USA ont une culture sociale différente de l'Afrique. Comprendre ces codes te permettra de t'intégrer rapidement et authentiquement!</p>
<h4>Communication Américaine</h4>
<div class="example-box"><div class="ex-label">💬 Les Codes Sociaux</div>• "How are you?" = salutation de politesse. Réponse attendue: "Good, thanks! You?" (pas un vrai appel d'aide!)<br/>• Culture très directe: les Américains disent clairement ce qu'ils veulent<br/>• Espace personnel (personal space): ~1 bras de distance. Ne te colle pas aux gens<br/>• Eye contact: important dans la conversation (montre respect et confiance)<br/>• Smiling: les Américains sourient beaucoup, même à des inconnus</div>
<h4>Amitiés Américaines</h4>
<div class="example-box"><div class="ex-label">🌟 Cultiver des Amitiés</div>• Américains peuvent sembler "amicaux mais pas amis" (friendly not friend)<br/>• Pour de vrais amis: rejoins des clubs, participe aux activités parascolaires<br/>• Organise des sorties: "Do you want to hang out this weekend?"<br/>• Sois ouverte sur ton identité camerounaise → les gens sont souvent très curieux de l'Afrique!</div>
<h4>Slang Américain Courant</h4>
<div class="example-box"><div class="ex-label">🗣️ Teen Vocabulary</div>"Lit" = super cool | "No cap" = pour de vrai, sans mentir | "Bet" = d'accord, okay | "Lowkey" = un peu, discrètement | "Slay" = réussir parfaitement | "Flex" = montrer | "GOAT" = Greatest Of All Time | "Ghost" = disparaître sans prévenir | "Vibe" = ambiance</div>
<div class="us-box"><div class="us-label">🇺🇸 Dating Culture</div>American teenagers may "date" starting 13-14. You are never obligated to follow these norms. Stay true to your values and background. Peer pressure is real — know what YOU want before you face it. Your counselor and parents are your resources.</div>`,
    en:`<h3>🤝 American Social Culture</h3>
<div class="example-box"><div class="ex-label">🇺🇸 Culture Quick Guide</div>• "How are you?" = greeting, not question | Smile at everyone | Personal space ~1 arm<br/>• Be yourself! Americans find international students fascinating | Join clubs to make real friends</div>
<div class="us-box"><div class="us-label">🇺🇸 Slang to Know</div>lit (amazing) | no cap (for real) | bet (okay) | slay (do great) | GOAT (Greatest Of All Time) | lowkey (somewhat) | vibe (atmosphere) | ghost (disappear) | flex (show off) | extra (too much)</div>`
  },
  l_int_transport: {
    title:'Transport & Sécurité', titleEn:'Getting Around Safely in the US',
    tags:['🇺🇸 Intégration','Pratique'], quizKey:'q_int_transport',
    fr:`<h3>🚌 Se Déplacer aux USA — Sûrement!</h3>
<p>Se déplacer aux USA est différent du Cameroun. La sécurité est primordiale!</p>
<h4>Transport Scolaire</h4>
<div class="example-box"><div class="ex-label">🚌 School Bus — Règles</div>• Généralement GRATUIT pour les élèves<br/>• Horaires stricts: il n'attendra PAS<br/>• Comportement: rester assis, calme, ne pas se lever pendant le trajet<br/>• Traverser DEVANT le bus (jamais derrière): le chauffeur te voit<br/>• Ta carte de bus (bus pass) est précieuse — ne la perds pas!</div>
<h4>Transport en Commun</h4>
<div class="example-box"><div class="ex-label">🚇 City Transit</div>• Subway/Métro: présent à NY, Chicago, LA, DC, SF<br/>• Bus (MTA, Metrobus, etc.): utilise Google Maps ou Transit App<br/>• Tarifs: $2-3 par trajet. Achète une carte mensuelle (monthly pass) si tu l'utilises souvent<br/>• Sécurité: reste dans les zones éclairées, garde ton téléphone rangé dans le bus la nuit</div>
<h4>Règles de Sécurité</h4>
<div class="example-box"><div class="ex-label">🔒 Safety Rules Non-Négociables</div>• JAMAIS seule avec un inconnu adulte (même en Uber/Lyft → partage ta position en live)<br/>• Partage ta localisation avec un parent avant tout déplacement<br/>• Traverser UNIQUEMENT aux passages piétons avec le signal vert<br/>• Voler ta voiture de la police (car-jacking): au feu rouge, vitres fermées, portes verrouillées<br/>• Urgence: appelle le 911 (gratuit, fonctionnne même sans crédit)</div>
<div class="us-box"><div class="us-label">🇺🇸 Apps to Download Immediately</div>Google Maps (navigation), Transit (public transport), Uber/Lyft (rides, use with parent), Life360 (family location sharing), Waze (traffic), 511 (local transit info). These apps will transform your independence and safety!</div>`,
    en:`<h3>🚌 Transportation Safety</h3>
<div class="example-box"><div class="ex-label">🔒 Non-Negotiable Rules</div>1. Never alone with an unknown adult (share location always)<br/>2. Cross ONLY at pedestrian lights<br/>3. School bus: cross IN FRONT, never behind<br/>4. Emergency: call 911 (free, always works)</div>
<div class="us-box"><div class="us-label">🇺🇸 Essential Apps</div>Google Maps + Transit App + Life360 (family tracking) + your school's app. Download before your first day!</div>`
  },
  l_int_health: {
    title:'Santé & Assurance aux USA', titleEn:'Healthcare & Insurance in the US',
    tags:['🇺🇸 Intégration','Santé'], quizKey:'q_int_health',
    fr:`<h3>🏥 Le Système de Santé Américain — Ce que Tu DOIS Savoir</h3>
<p>La santé aux USA est <strong>privée</strong> et peut être très coûteuse sans assurance. Comprendre ce système peut littéralement te sauver la vie ET ton budget!</p>
<h4>L'Assurance Maladie (Health Insurance)</h4>
<div class="example-box"><div class="ex-label">💊 Types de Couverture</div>• <strong>Assurance privée</strong>: via l'employeur des parents ou achetée sur HealthCare.gov<br/>• <strong>Medicaid</strong>: programme gouvernemental GRATUIT pour familles à faibles revenus. INSCRIS-TOI si éligible!<br/>• <strong>CHIP</strong>: Children's Health Insurance Program — pour enfants dont les parents ne sont pas éligibles à Medicaid mais n'ont pas les moyens d'une assurance privée<br/>• <strong>School-based</strong>: certaines écoles ont des cliniques sur place</div>
<h4>Vocabulaire Médical US</h4>
<div class="formula-box">Premium = cotisation mensuelle | Deductible = franchise | Copay = participation | Network = réseau de médecins couverts</div>
<h4>Comment Consulter</h4>
<div class="example-box"><div class="ex-label">🩺 Processus de Soin</div>1. <strong>Primary Care Physician (PCP)</strong>: ton médecin de famille → pour tout problème non-urgent<br/>2. <strong>Specialist</strong>: cardiologue, dermatologue... sur référence du PCP<br/>3. <strong>Urgent Care</strong>: problème médical non-urgent mais qui ne peut pas attendre (fièvre élevée, coupure)<br/>4. <strong>Emergency Room (ER)</strong>: pour VRAIES urgences (accident, perte de connaissance). TRÈS CHER sans assurance!</div>
<div class="example-box"><div class="ex-label">💉 Vaccins Obligatoires pour l'École</div>Les écoles américaines exigent: MMR (rougeole, oreillons, rubéole), Varicelle, Hépatite B, Tdap, Méningocoque. Assure-toi que ton carnet de vaccination est à jour et traduit en anglais AVANT d'arriver!</div>
<div class="us-box"><div class="us-label">🇺🇸 Resources Gratuites</div>Federally Qualified Health Centers (FQHC): cliniques à prix réduit ou gratuit selon revenus. Find one at findahealthcenter.hrsa.gov. School nurses can provide basic care and referrals for free.</div>`,
    en:`<h3>🏥 US Healthcare</h3>
<div class="formula-box">Premium (monthly) + Deductible (before insurance pays) + Copay (your share per visit)</div>
<div class="us-box"><div class="us-label">🇺🇸 Medicaid & CHIP</div>If your family has low income, apply for Medicaid or CHIP immediately! These provide free or very low-cost healthcare. Many immigrant families are eligible but don't apply. Don't miss out on this crucial benefit — apply at healthcare.gov or your local county health department.</div>`
  },
  l_int_college: {
    title:'Préparation à l\'Université', titleEn:'College Prep — Start Now at 13!',
    tags:['🇺🇸 Intégration','College Prep','PRIORITÉ'], quizKey:'q_int_college',
    fr:`<h3>🎓 Prépare ton Université dès Maintenant!</h3>
<p>Tu as 13 ans. C'est le BON moment pour commencer. Les décisions que tu prends maintenant en 8th grade ont un impact direct sur les universités auxquelles tu pourras postuler dans 5 ans!</p>
<h4>Timeline 8th Grade → University</h4>
<div class="example-box"><div class="ex-label">📅 Ta Feuille de Route</div>• <strong>8th-9th grade</strong>: rejoins des clubs STEM, maintiens GPA fort, apprends les codes de l'école US<br/>• <strong>9th-10th grade</strong>: clubs, bénévolat, leadership (vise présidente d'un club!), commence SAT prep<br/>• <strong>10th grade</strong>: PSAT (octobre), research summer STEM programs (Duke TIP, MIT Launch, etc.)<br/>• <strong>11th grade</strong>: SAT/ACT (mars ou mai), campus visits, recherche de bourses, AP classes<br/>• <strong>12th grade</strong>: applications (Common App ouvre août), essays, FAFSA (1er octobre)<br/>• <strong>Admission</strong>: décisions en mars/avril, choix final 1er mai</div>
<h4>Les Examens Standardisés</h4>
<div class="formula-box">SAT: max 1600 (Math 800 + Reading/Writing 800) | ACT: max 36<br/>Préparation gratuite: Khan Academy SAT Prep (khanacademy.org)</div>
<h4>STEM Programs pour Jeunes (Commence Dès 13 Ans!)</h4>
<div class="example-box"><div class="ex-label">🚀 Opportunités Extraordinaires</div>• <strong>Duke TIP</strong>: programme pour jeunes doués (talent identification)<br/>• <strong>MIT PRIMES</strong>: programme de recherche pour lycéens<br/>• <strong>Google Code to Learn</strong>: bourses coding<br/>• <strong>Questbridge</strong>: programme pour élèves méritants à faibles revenus<br/>• <strong>Jack Kent Cooke Scholarship</strong>: jusqu'à $40,000/an!<br/>• <strong>Science Olympiad</strong>: compétition STEM inter-écoles → valorisé pour MIT/Caltech/Stanford</div>
<div class="us-box"><div class="us-label">🇺🇸 Your University List</div>Safety schools (admit 50%+), match schools (30-50%), reach schools (MIT, Stanford, Harvard — apply anyway!). Many STEM scholarships specifically target bilingual, first-generation, and African students. Your unique story = your application's superpower!</div>`,
    en:`<h3>🎓 College Prep Timeline</h3>
<div class="formula-box">8th: Join clubs → 9th: Leadership → 10th: PSAT + summer programs → 11th: SAT + campus visits → 12th: Apply!</div>
<div class="us-box"><div class="us-label">🇺🇸 Khan Academy — Your Free SAT Coach</div>Khan Academy partnered with the College Board (SAT creators) to provide FREE personalized SAT prep. Studies show students who practice 20+ hours gain an average of 115 points! Go to khanacademy.org and start your SAT practice TODAY.</div>`
  },

  // ══ PE ══
  l_pe_sports: {
    title:'Sports Américains', titleEn:'American Sports Culture',
    tags:['🏃🏾‍♀️ PE','Culture US'], quizKey:'q_pe_sports',
    fr:`<h3>🏈 Les Sports Américains — Comprendre la Culture</h3>
<p>Le sport est au cœur de la culture américaine. Comprendre les sports te permettra de t'intégrer et de te faire des amis rapidement!</p>
<h4>Les 4 Sports Majeurs (Big 4)</h4>
<div class="example-box"><div class="ex-label">🏆 Les Incontournables</div>• <strong>Football Américain</strong> (pas le soccer!): sport #1. Saison: automne. Super Bowl en février = fête nationale!<br/>• <strong>Basketball</strong>: très populaire dans les écoles. NBA = ligue professionnelle. Joue au gymnase de l'école!<br/>• <strong>Baseball</strong>: "America's Pastime". Saison: printemps-été. MLB = ligue professionnelle<br/>• <strong>Ice Hockey</strong>: surtout Nord des USA. NHL = ligue professionnelle</div>
<h4>Sports à l'École</h4>
<div class="example-box"><div class="ex-label">🎓 Sports Programs</div>• Rejoindre une équipe = excellent pour l'intégration, les amis, ET les applications universitaires<br/>• Sports où les Africaines excellent: track & field (sprint, course), basketball, volleyball, soccer<br/>• <strong>Title IX</strong>: loi qui garantit ÉGALITÉ hommes/femmes dans tous les sports scolaires. Profite-en!<br/>• Sport + GPA fort + leadership = profil universitaire très solide!</div>
<div class="example-box"><div class="ex-label">⚽ Soccer (= le Football pour toi!)</div>Soccer est de plus en plus populaire aux USA, surtout chez les jeunes et les communautés immigrantes. NWSL = ligue professionnelle féminine. Si tu joues au foot au Cameroun, continue aux USA!</div>
<div class="us-box"><div class="us-label">🇺🇸 Sports Vocabulary</div><strong>touchdown (football), basket/layup (basketball), home run (baseball), penalty kick (soccer), referee, team, coach, practice (entraînement), season, playoffs, championship, varsity (équipe principale), JV (junior varsity).</strong></div>`,
    en:`<h3>🏈 American Sports</h3>
<div class="formula-box">Big 4: Football (#1) + Basketball + Baseball + Ice Hockey | Soccer growing fast!</div>
<div class="us-box"><div class="us-label">🇺🇸 Sports = Social Integration</div>Joining a school sports team is the FASTEST way to make American friends, learn the culture, and build your college application. Ask your PE teacher about tryouts (auditions). Title IX guarantees equal sports opportunities for girls — use it!</div>`
  },
  l_pe_fit: {
    title:'Fitness & Bien-être', titleEn:'Fitness & Wellness for Teens',
    tags:['🏃🏾‍♀️ PE','Santé'], quizKey:'q_pe_fit',
    fr:`<h3>💪 Fitness & Bien-être — Investis dans Ton Corps!</h3>
<p>À 13 ans, ton corps est en plein développement. L'exercice régulier améliore tes notes, ta santé mentale, et ton bien-être général!</p>
<h4>Recommandations OMS pour les Ados</h4>
<div class="formula-box">60 minutes d'activité physique/jour (30 min intense minimum)<br/>8-10 heures de sommeil | 2 litres d'eau minimum | &lt;2h d'écran récréatif</div>
<h4>Types d'Exercice</h4>
<div class="example-box"><div class="ex-label">🏃 Équilibre Optimal</div>• <strong>Cardio-respiratoire</strong>: course, danse, natation, vélo → cœur et endurance<br/>• <strong>Renforcement musculaire</strong>: pompes, squats, yoga → force et posture<br/>• <strong>Flexibilité</strong>: étirements, yoga → mobilité et prévention blessures</div>
<h4>Sport et Santé Mentale</h4>
<div class="example-box"><div class="ex-label">🧠 Preuves Scientifiques</div>• 30 min de marche = aussi efficace qu'un médicament antidépresseur léger<br/>• L'exercice libère: endorphines (plaisir), sérotonine (humeur), BDNF (croissance neuronale)<br/>• Améliore la mémoire et la concentration → meilleures notes prouvées scientifiquement!<br/>• Réduit le stress du choc culturel (très utile pour ton arrivée aux USA!)</div>
<h4>Activités Gratuites et Accessibles</h4>
<div class="example-box"><div class="ex-label">💸 Fitness sans Budget</div>• Marche/Course: 100% gratuit, partout<br/>• Yoga YouTube: Yoga with Adriene (gratuit, débutante bienvenue)<br/>• Jump rope (corde à sauter): $5, brûle 600 cal/heure!<br/>• Parc public (park): équipements de gym souvent disponibles gratuitement<br/>• Sports à l'école: GRATUITS pour les élèves inscrits</div>
<div class="us-box"><div class="us-label">🇺🇸 PE in US Schools</div>PE (Physical Education) is required and GRADED in US schools! You'll do: fitness tests (running, push-ups, flexibility), team sports, individual sports. Wear your PE uniform, participate fully, and enjoy it — it's a break from academic pressure AND it counts toward your GPA!</div>`,
    en:`<h3>💪 Teen Fitness & Wellness</h3>
<div class="formula-box">60 min activity/day | 8-10h sleep | 2L water | 30 min exercise = proven mood boost</div>
<div class="us-box"><div class="us-label">🇺🇸 PE Class at Your US School</div>PE is graded! Wear appropriate clothes (athletic wear). You'll do fitness tests, play team sports (volleyball, basketball, tennis), and maybe swim. Participate fully — it's one of the most fun parts of the school day and a great way to make friends quickly.</div>`
  },

};

// ── Key aliases (legacy name → new name) ──
LESSONS.l_civ_immigr  = LESSONS.l_civics_immigr;
LESSONS.l_hlth_mental = LESSONS.l_health_mental;
const _LESSONS_ALIAS_DONE = true; // sentinel

// ══════════════════════════════════════════
// QUIZ DATA
// ══════════════════════════════════════════
const QUIZZES = {
  q_newton: { title:"Newton's Laws", questions:[
    { text:"Un moto-taxi roule à vitesse constante. Quelle est la somme des forces?", ctx:"🛵 Route de Mvog-Mbi", choices:["∑F > 0","∑F = 0","∑F < 0","Impossible de dire"], correct:1,
      ok:"✅ Correct! 1ère loi: vitesse constante → ∑F⃗ = 0. Les forces sont équilibrées.",
      bad:"Rappel: 1ère loi de Newton – vitesse constante (ou repos) ↔ somme des forces nulle."},
    { text:"A mango (m = 0.4 kg) falls from a rooftop. What is its weight? (g = 10 m/s²)", choices:["0.4 N","4 N","10 N","40 N"], correct:1,
      ok:"✅ Correct! F = m × g = 0.4 × 10 = 4 N. F=ma is Newton's 2nd Law!",
      bad:"F = m × g = 0.4 kg × 10 m/s² = 4 N. Remember: weight = mass × gravitational acceleration."},
    { text:"Tu pousses un mur avec 60 N. Quelle force le mur exerce-t-il sur toi?", choices:["0 N","30 N","60 N dans le même sens","60 N dans le sens opposé"], correct:3,
      ok:"✅ Parfait! 3ème loi: toute force a une réaction égale et opposée.",
      bad:"3ème loi de Newton: le mur te repousse avec la MÊME force (60 N) mais dans la direction OPPOSÉE."},
    { text:"In US 8th grade Physics, 'velocity' differs from 'speed' because:", choices:["Velocity is faster","Velocity includes direction","Speed is a vector","They are identical"], correct:1,
      ok:"✅ Correct! Velocity = vector (magnitude + direction). Speed = scalar (magnitude only). Key US vocab!",
      bad:"Velocity = speed + direction (it's a vector). Speed is just a number (scalar). This distinction is tested often in US schools."},
    { text:"Un footballeur frappe un ballon (m=0.45 kg) qui accélère à 25 m/s². Quelle force? F = m × a", choices:["0.45 N","11.25 N","25 N","55.5 N"], correct:1,
      ok:"✅ Bravo! F = 0.45 × 25 = 11.25 N. Le PFD en action!",
      bad:"F = m × a = 0.45 kg × 25 m/s² = 11.25 N. Toujours multiplier masse × accélération."}
  ]},
  q_math_eq: { title:"Équations & Algebra", questions:[
    { text:"Résous: 3x + 9 = 24", choices:["x = 3","x = 5","x = 11","x = 8"], correct:1,
      ok:"✅ 3x = 24−9 = 15 → x = 5. Bien joué!",
      bad:"3x + 9 = 24 → 3x = 15 → x = 5. Toujours isoler le terme en x en premier."},
    { text:"A student earns $8.50/hour. She needs at least $102. Which inequality?", choices:["8.5h = 102","8.5h ≤ 102","8.5h ≥ 102","h/8.5 ≥ 102"], correct:2,
      ok:"✅ 'At least' = ≥! 8.5h ≥ 102 → h ≥ 12 hours. Perfect US Algebra I!",
      bad:"'At least $102' means minimum = ≥. So 8.5h ≥ 102 → h ≥ 12 hours."},
    { text:"Amina achète x mangues à 250 FCFA. Elle paye avec 2000 FCFA et reçoit 500 FCFA. Combien de mangues?", ctx:"🥭 Marché de Douala", choices:["4","5","6","7"], correct:2,
      ok:"✅ 2000 − 500 = 1500 FCFA dépensés. 1500/250 = 6 mangues!",
      bad:"Dépensé = 2000 − 500 = 1500 FCFA. 1500 ÷ 250 = 6 mangues."},
    { text:"Discriminant de x² − 5x + 6 = 0?", choices:["Δ = 1","Δ = 49","Δ = −1","Δ = 25"], correct:0,
      ok:"✅ Δ = b²−4ac = 25−24 = 1. Solutions: x = (5±1)/2 → x=3 ou x=2.",
      bad:"Δ = b²−4ac = (−5)²−4(1)(6) = 25−24 = 1."},
    { text:"Solve: −4x > 20", choices:["x > −5","x < −5","x > 5","x < 5"], correct:1,
      ok:"✅ Dividing by −4 FLIPS the sign! −4x > 20 → x < −5. Critical rule!",
      bad:"When dividing by a NEGATIVE number, the inequality sign flips! −4x > 20 → x < −5."}
  ]},
  q_chem_atoms: { title:"Atomes & Chimie", questions:[
    { text:"L'atome de Sodium (Na) a Z=11. Sa configuration électronique est:", choices:["2,9","2,8,1","3,8","2,7,2"], correct:1,
      ok:"✅ Z=11: K=2, L=8, M=1. Configuration 2,8,1. Na veut perdre cet électron → Na⁺!",
      bad:"On remplit couche par couche: K(max 2)=2, L(max 8)=8, M=1. Total=11=Z ✓"},
    { text:"What is the atomic number of Oxygen (O), the most abundant element in the human body?", choices:["6","7","8","16"], correct:2,
      ok:"✅ Oxygen has Z=8 (8 protons). Configuration: 2,6. It needs 2 more electrons to complete its outer shell!",
      bad:"Oxygen: Z=8, A=16 (approximately). Configuration: 2,6. Needs 2 electrons to be stable."},
    { text:"Le sel de cuisine NaCl est formé par:", choices:["Liaison covalente","Liaison ionique","Liaison métallique","Liaison hydrogène"], correct:1,
      ok:"✅ NaCl = liaison ionique. Na⁺ cède un électron à Cl⁻. Les charges opposées s'attirent!",
      bad:"NaCl est ionique: Na perd 1e⁻ → Na⁺, Cl gagne 1e⁻ → Cl⁻. Attraction électrostatique = liaison ionique."}
  ]},
  q_int_school: { title:"Système Éducatif US", questions:[
    { text:"Tu as eu 17/20 en maths au Cameroun. Quelle lettre américaine?", choices:["A","B","C","D"], correct:0,
      ok:"✅ 17/20 = 85% → B? Non! 85% = B. Pour A il faut ≥90% (≥18/20). Recalcule: 17/20=85%=B.",
      bad:"17/20 = 85%. US scale: 90-100%=A, 80-89%=B. 85% = B. Close to A but not quite!"},
    { text:"Ton GPA est 3.7. Ce score est:", choices:["Insuffisant pour l'université","Moyen","Excellent – ouvre de nombreuses portes","Parfait"], correct:2,
      ok:"✅ 3.7 GPA est excellent! (entre A- et A). Beaucoup d'universités acceptent 3.5+. Harvard/MIT veulent 3.9+.",
      bad:"GPA 3.7 = excellent! Scale: 4.0=A, 3.0=B. Most universities require 3.0 minimum. 3.7 opens many doors!"},
    { text:"En tant qu'élève immigrante, as-tu le droit à l'éducation publique aux USA?", choices:["Seulement avec un visa étudiant","Non, il faut d'abord régulariser","Oui, quel que soit le statut (Plyler v. Doe)","Seulement dans certains États"], correct:2,
      ok:"✅ Plyler v. Doe (1982): TOUT enfant a droit à l'éducation publique gratuite, statut migratoire ignoré. Droit constitutionnel!",
      bad:"Plyler v. Doe (Cour Suprême, 1982): L'éducation publique est un droit pour TOUS les enfants aux USA, sans exception."}
  ]},
  q_int_day1: { title:"Survie à l'École US", questions:[
    { text:"Ton teacher dit 'This assignment is due Friday.' Que dois-tu faire?", choices:["Rien, c'est optionnel","Remettre le travail avant vendredi","Commencer le travail vendredi","Demander plus de détails"], correct:1,
      ok:"✅ 'Due' = deadline! 'Due Friday' = remettre avant/le vendredi. Vocabulaire crucial!",
      bad:"'Due' = date limite de remise. 'Due Friday' = le travail doit être rendu vendredi."},
    { text:"Comment demander à aller aux toilettes en anglais?", choices:["I want toilet","Can I use the restroom please?","I need bathroom now","Where toilet is?"], correct:1,
      ok:'✅ "May I use the restroom?" ou "Can I use the restroom please?" sont corrects et polis!',
      bad:'"Can I use the restroom please?" ou "May I use the restroom?" sont les formulations correctes et polies.'},
    { text:"Un 'counselor' à l'école américaine est:", choices:["Un professeur de chimie","Un gardien de sécurité","Un conseiller qui aide les élèves","Le directeur"], correct:2,
      ok:"✅ Le counselor t'aide pour tout: emploi du temps, orientation, problèmes personnels, université. C'est TON allié!",
      bad:"Le school counselor aide les élèves pour l'orientation scolaire, les problèmes personnels, et les plans universitaires. Très précieux!"}
  ]},
  q_ela_gram: { title:"English Grammar", questions:[
    { text:"Choose the correct sentence:", choices:["I have 13 years old.","I am 13 years old.","I am having 13 years.","I have 13 years."], correct:1,
      ok:'✅ "I am 13 years old." — In English, we use "to be" for age, NOT "to have" (common French speaker mistake!)',
      bad:'In English: "I AM [age] years old" — never "I have [age] years." This is the most common French→English mistake!'},
    { text:"Which is grammatically correct?", choices:["She don't know the answer.","She doesn't know the answer.","She not know the answer.","She do not know the answer (she = girl)."], correct:1,
      ok:"✅ 'She doesn't know' — with he/she/it, use 'doesn't' (not 'don't'). Subject-verb agreement!",
      bad:"With he/she/it (3rd person singular), use 'doesn't' for negation. 'She doesn't know' is correct."},
    { text:"'Informations' en français → en anglais:", choices:["Informations","Informations (plural)","Information (uncountable)","Infos"], correct:2,
      ok:"✅ 'Information' is uncountable in English — no 's'! Same for: advice, furniture, news, luggage.",
      bad:"'Information' is uncountable in English — no plural 's'! Other uncountable nouns: advice, furniture, news, luggage."}
  ]},
  q_evolution: { title:"Evolution & Natural Selection", questions:[
    { text:"Selon Darwin, les individus qui survivent le mieux sont ceux qui:", choices:["Sont les plus grands","Sont les mieux adaptés à leur environnement","Sont les plus rapides","Ont le plus d'enfants"], correct:1,
      ok:"✅ Sélection naturelle: les mieux ADAPTÉS survivent et se reproduisent plus. Pas forcément les plus grands ou rapides!",
      bad:"Darwin: survie = adaptation à l'environnement. Ce qui compte c'est l'adéquation au milieu, pas la taille ou la vitesse."},
    { text:"What evidence supports the theory of evolution? (Choose best answer)", choices:["Religious texts","Fossil record, DNA comparisons, and anatomical similarities","Only fossils","Scientists' opinions"], correct:1,
      ok:"✅ Evolution is supported by: fossil record, comparative DNA, anatomical homologies, biogeography, and observed speciation. Strongest evidence in biology!",
      bad:"Multiple independent lines of evidence support evolution: fossils, DNA comparisons, comparative anatomy, biogeography, and direct observation."}
  ]},
  q_civics: { title:"Civics & Immigration", questions:[
    { text:"Combien de branches a le gouvernement américain?", choices:["2","3","4","5"], correct:1,
      ok:"✅ 3 branches: Législative (Congrès), Exécutive (Président), Judiciaire (Cour Suprême). Séparation des pouvoirs!",
      bad:"Les USA ont 3 branches: Législative (fait les lois), Exécutive (applique les lois), Judiciaire (interprète les lois)."},
    { text:"Quel arrêt de la Cour Suprême garantit l'éducation aux enfants sans papiers?", choices:["Brown v. Board","Plyler v. Doe","Roe v. Wade","Miranda v. Arizona"], correct:1,
      ok:"✅ Plyler v. Doe (1982): droit à l'éducation publique pour TOUS les enfants, statut migratoire ignoré.",
      bad:"Plyler v. Doe (1982) est l'arrêt qui garantit l'accès à l'éducation publique à tous les enfants aux USA."}
  ]},
  q_finance: { title:"Financial Literacy", questions:[
    { text:"Aux USA, le prix affiché en magasin:", choices:["Inclut toujours la taxe","N'inclut PAS la taxe (ajoutée en caisse)","Est le prix final","Dépend du magasin"], correct:1,
      ok:"✅ Aux USA, la taxe (sales tax) est ajoutée à la caisse. Un article affiché $10 peut coûter $10.85 selon l'État!",
      bad:"USA: La taxe (sales tax) est AJOUTÉE à la caisse. Le prix affiché est hors taxe. Prévois toujours 5–10% en plus!"},
    { text:"What is a 'GPA' used for in the US?", choices:["Bank account type","Grade Point Average – for university admission","Government Program for Adults","General Payment Agreement"], correct:1,
      ok:"✅ GPA = Grade Point Average. Scale 0.0–4.0. Used by colleges for admissions. Target: 3.5+ for good schools!",
      bad:"GPA = Grade Point Average (0.0 to 4.0). Used by colleges and universities to evaluate academic performance."}
  ]},
  q_health: { title:"Santé Mentale & Bien-être", questions:[
    { text:"Le 'choc culturel' est:", choices:["Une maladie grave","Un sentiment normal d'adaptation à une nouvelle culture","Un signe de faiblesse","Uniquement pour les adultes"], correct:1,
      ok:"✅ Le choc culturel est une réponse NORMALE et universelle à un nouveau pays. Tout immigrant le vit!",
      bad:"Le choc culturel est une réaction normale et saine à un changement culturel majeur. Il se résout avec le temps."},
    { text:"Si tu te sens très déprimée aux USA, quel numéro appeler?", choices:["911 (police)","988 (Suicide & Crisis Lifeline)","411 (information)","811 (santé)"], correct:1,
      ok:"✅ 988 est la ligne de crise nationale, gratuite, 24h/24. Appelle ou texte 988 si tu as besoin d'aide.",
      bad:"988 est le numéro de la Suicide & Crisis Lifeline — gratuit, confidentiel, 24h/24. Toujours disponible pour toi."}
  ]},
  // ══ MATH QUIZZES ══
  q_math_logic: { title:"Logique & Ensembles", questions:[
    { text:"A={1,2,3,4} et B={3,4,5,6}. Que vaut A∩B?", choices:["{1,2,3,4,5,6}","{3,4}","{1,2,5,6}","{1,2}"], correct:1,
      ok:"✅ Correct! A∩B = éléments communs aux deux ensembles = {3,4}.",
      bad:"A∩B = intersection = éléments DANS A ET dans B. Ici: 3 et 4 sont dans les deux. A∩B = {3,4}."},
    { text:"La proposition 'Si il pleut alors le sol est mouillé' est de la forme:", choices:["P ET Q","P OU Q","P ⟹ Q","P ⟺ Q"], correct:2,
      ok:"✅ Parfait! 'Si P alors Q' est une implication: P⟹Q.",
      bad:"'Si P alors Q' = P⟹Q (implication logique). Moyen mnémotechnique: la flèche va dans le sens de la conséquence."},
    { text:"Parmi ces nombres, lesquels appartiennent à ℤ mais PAS à ℕ?", choices:["{0, 1, 2}","{-3, -1}","{1/2, 3/4}","{π, √2}"], correct:1,
      ok:"✅ Exact! ℕ = {0,1,2,...} et ℤ = {...,-2,-1,0,1,2,...}. Donc -3 et -1 sont dans ℤ mais pas dans ℕ.",
      bad:"ℕ⊂ℤ: les entiers naturels sont dans les relatifs. Mais les négatifs {-3,-1} sont dans ℤ et PAS dans ℕ."}
  ]},
  q_math_reels: { title:"Nombres Réels & Intervalles", questions:[
    { text:"Quelle est la valeur de |-7| + |3|?", choices:["4","10","-4","-10"], correct:1,
      ok:"✅ Correct! |-7|=7 et |3|=3, donc 7+3=10. La valeur absolue = distance à zéro, toujours positive!",
      bad:"Valeur absolue: |x| est TOUJOURS positif. |-7|=7, |3|=3. Total = 10."},
    { text:"L'intervalle [2, 5[ contient-il le nombre 5?", choices:["Oui, 5 est dans l'intervalle","Non, 5 est exclu","Cela dépend","[2,5[ ne contient que des entiers"], correct:1,
      ok:"✅ Exact! [2,5[ = crochet fermé en 2 (inclus), crochet ouvert en 5 (exclu). Donc 5 ∉ [2,5[.",
      bad:"Convention: [ = inclus, [ = exclu. Donc [2,5[ inclut 2 mais EXCLUT 5."},
    { text:"√2 est un nombre:", choices:["Naturel (ℕ)","Entier (ℤ)","Rationnel (ℚ)","Irrationnel (ℝ\\ℚ)"], correct:3,
      ok:"✅ Bravo! √2 ≈ 1.41421356... ne se termine jamais et ne se répète jamais → irrationnel!",
      bad:"√2 = 1.41421356... est irrationnel: décimal infini non périodique. Il appartient à ℝ mais pas à ℚ."}
  ]},
  q_math_func: { title:"Fonctions Numériques", questions:[
    { text:"f(x) = 3x − 2. Quelle est la valeur de f(4)?", choices:["10","14","12","6"], correct:0,
      ok:"✅ f(4) = 3×4 − 2 = 12 − 2 = 10. Substitue x par 4 dans l'expression!",
      bad:"f(4): remplace x par 4. f(4) = 3×4 − 2 = 12 − 2 = 10."},
    { text:"La pente de la droite y = −2x + 5 est:", choices:["5","-2","2","-5"], correct:1,
      ok:"✅ Parfait! Dans y=ax+b, 'a' est la pente (slope). Ici a=−2: pour chaque +1 en x, y diminue de 2.",
      bad:"y=ax+b → a = pente, b = ordonnée à l'origine. Ici y=−2x+5: pente = −2 (descend!)."},
    { text:"What is the y-intercept of f(x) = 4x + 7?", choices:["4","7","0","11"], correct:1,
      ok:"✅ y-intercept = value when x=0. f(0)=4(0)+7=7. In y=mx+b, b is always the y-intercept!",
      bad:"y-intercept: set x=0. f(0)=4(0)+7=7. In y=mx+b form, b=7 is the y-intercept."}
  ]},
  q_math_trigo: { title:"Trigonométrie", questions:[
    { text:"Dans un triangle rectangle, sin(30°) = ?", choices:["√3/2","1/2","√2/2","1"], correct:1,
      ok:"✅ sin(30°)=1/2. À mémoriser: sin(30)=1/2, cos(30)=√3/2, sin(60)=√3/2, cos(60)=1/2.",
      bad:"Valeurs remarquables: sin(30°)=1/2, cos(30°)=√3/2. Moyen: SOHCAHTOA et tableau des valeurs."},
    { text:"Dans un triangle rectangle, si l'hypoténuse=10 et un angle=45°, quelle est la longueur du côté opposé?", choices:["5","7.07","8.66","10"], correct:1,
      ok:"✅ sin(45°)=√2/2≈0.707. Opposé = 10×sin(45°) = 10×0.707 ≈ 7.07.",
      bad:"sin(θ)=opposé/hypoténuse → opposé=hyp×sin(θ)=10×sin(45°)=10×0.707≈7.07."},
    { text:"Quelle identité trigonométrique est TOUJOURS vraie?", choices:["sin(x)+cos(x)=1","sin²(x)+cos²(x)=1","sin(x)=cos(x)","tan(x)=sin(x)+cos(x)"], correct:1,
      ok:"✅ L'identité fondamentale: sin²(x)+cos²(x)=1. C'est le théorème de Pythagore appliqué au cercle unité!",
      bad:"L'identité fondamentale: sin²(x)+cos²(x)=1. C'est TOUJOURS vrai pour n'importe quel angle x."}
  ]},
  q_math_vect: { title:"Vecteurs", questions:[
    { text:"A(1,2) et B(4,6). Quelles sont les coordonnées du vecteur AB⃗?", choices:["(5,8)","(3,4)","(-3,-4)","(2,4)"], correct:1,
      ok:"✅ AB⃗ = (xB−xA, yB−yA) = (4−1, 6−2) = (3, 4).",
      bad:"AB⃗ = (xB−xA ; yB−yA) = (4−1 ; 6−2) = (3 ; 4). Toujours B moins A!"},
    { text:"La norme du vecteur v⃗=(3,4) est:", choices:["7","25","5","12"], correct:2,
      ok:"✅ ||v⃗|| = √(3²+4²) = √(9+16) = √25 = 5. Triangle 3-4-5, le classique!",
      bad:"||v⃗|| = √(vx²+vy²) = √(9+16) = √25 = 5. C'est le théorème de Pythagore!"}
  ]},
  q_math_stats: { title:"Statistiques & Probabilités", questions:[
    { text:"Données: 2, 4, 4, 6, 8, 10. Quelle est la moyenne?", choices:["4","5.67","6","4.5"], correct:2,
      ok:"✅ Moyenne = (2+4+4+6+8+10)/6 = 34/6 ≈ 5.67. Attends, 34/6=5.67... La bonne réponse est 5.67!",
      bad:"Moyenne = somme/effectif = (2+4+4+6+8+10)/6 = 34/6 ≈ 5.67."},
    { text:"Données: 3, 5, 7, 7, 9. Quel est le mode?", choices:["7","6","5","Pas de mode"], correct:0,
      ok:"✅ Le mode est la valeur qui apparaît le plus souvent. 7 apparaît 2 fois → mode = 7.",
      bad:"Le mode = valeur la plus fréquente. Ici 7 apparaît 2 fois (le plus souvent) → mode = 7."},
    { text:"Une pièce de monnaie est lancée. Quelle est la probabilité d'obtenir 'pile'?", choices:["1","0","1/2","1/4"], correct:2,
      ok:"✅ P(pile) = 1 cas favorable / 2 cas totaux = 1/2 = 0.5 = 50%.",
      bad:"P = cas favorables / cas totaux = 1/2. Il y a 2 faces (face et pile), 1 seule est pile → P = 1/2."}
  ]},
  q_math_us: { title:"Pont vers l'Algèbre US", questions:[
    { text:"Solve: 2x + 6 = 14. What is x?", choices:["4","10","3","7"], correct:0,
      ok:"✅ 2x = 14−6 = 8, x = 8/2 = 4. Check: 2(4)+6 = 8+6 = 14 ✓",
      bad:"2x+6=14 → 2x=8 → x=4. Always check: 2(4)+6=14 ✓"},
    { text:"Factor: x² − 9", choices:["(x+3)²","(x−3)(x+3)","(x−9)(x+1)","(x−3)²"], correct:1,
      ok:"✅ Difference of squares: a²−b² = (a−b)(a+b). Here: x²−9 = x²−3² = (x−3)(x+3).",
      bad:"Difference of squares formula: a²−b² = (a−b)(a+b). x²−9 = (x−3)(x+3)."}
  ]},

  // ══ PHYSICS QUIZZES ══
  q_phys_cin: { title:"Cinématique", questions:[
    { text:"Un train parcourt 360 km en 3 heures. Quelle est sa vitesse moyenne?", choices:["100 km/h","120 km/h","108 km/h","90 km/h"], correct:1,
      ok:"✅ v = d/t = 360/3 = 120 km/h.",
      bad:"Vitesse moyenne = distance/durée = 360 km ÷ 3 h = 120 km/h."},
    { text:"Une voiture démarre de v₀=0 avec a=4 m/s². Quelle est sa vitesse après 5 secondes?", choices:["20 m/s","4 m/s","9 m/s","25 m/s"], correct:0,
      ok:"✅ v = v₀ + at = 0 + 4×5 = 20 m/s = 72 km/h.",
      bad:"v = v₀+at = 0+(4)(5) = 20 m/s. Pense: chaque seconde, +4 m/s de vitesse."},
    { text:"'Displacement' en physique américaine signifie:", choices:["La distance totale parcourue","Le déplacement (changement de position, vecteur)","La vitesse","L'accélération"], correct:1,
      ok:"✅ Displacement = vecteur du point initial au point final. Distance = chemin total parcouru. Ce sont deux choses différentes!",
      bad:"Displacement (déplacement) = vecteur pointant de la position initiale à la finale. Distance = longueur du chemin total."}
  ]},
  q_phys_opt: { title:"Optique Géométrique", questions:[
    { text:"Un rayon lumineux frappe un miroir plan avec un angle d'incidence de 40°. Quel est l'angle de réflexion?", choices:["80°","40°","20°","50°"], correct:1,
      ok:"✅ Loi de réflexion: angle d'incidence = angle de réflexion. Si i=40°, r=40°.",
      bad:"Loi de réflexion: i=r. Si l'angle d'incidence est 40°, l'angle de réflexion est également 40°."},
    { text:"Pourquoi une paille semble-t-elle brisée dans un verre d'eau?", choices:["Elle est réellement brisée","Réflexion totale interne","Réfraction: la lumière change de direction en changeant de milieu","L'eau la déforme chimiquement"], correct:2,
      ok:"✅ C'est la réfraction! La lumière change de direction quand elle passe de l'eau à l'air, créant une illusion de 'brisure'.",
      bad:"Réfraction: quand la lumière passe d'un milieu (eau) à un autre (air), elle change de direction. Cela crée l'illusion de la paille brisée."}
  ]},
  q_phys_elec: { title:"Circuits Électriques", questions:[
    { text:"Un résistor a R=100Ω sous une tension U=12V. Quelle est l'intensité du courant?", choices:["1200 A","0.12 A","1.2 A","120 A"], correct:1,
      ok:"✅ I = U/R = 12/100 = 0.12 A. Loi d'Ohm: U=RI → I=U/R.",
      bad:"Loi d'Ohm: U=RI → I=U/R = 12÷100 = 0.12 A = 120 mA."},
    { text:"Dans un circuit série avec R₁=30Ω et R₂=20Ω, quelle est la résistance totale?", choices:["10Ω","600Ω","50Ω","25Ω"], correct:2,
      ok:"✅ En série: Rtotal = R₁+R₂ = 30+20 = 50Ω.",
      bad:"Série: Rtotal = R₁+R₂+... = 30+20 = 50Ω. En parallèle ce serait différent (1/Rt=1/R₁+1/R₂)."},
    { text:"Le système électrique américain utilise une tension de:", choices:["220V comme au Cameroun","110-120V","240V","380V"], correct:1,
      ok:"✅ USA: 120V (60Hz). Cameroun: 220V (50Hz). Adapte tes appareils électriques!",
      bad:"USA: 120V/60Hz. Cameroun/Europe: 220V/50Hz. Certains appareils camerounais ont besoin d'un adaptateur de tension aux USA!"}
  ]},
  q_phys_energy: { title:"Énergie & Travail", questions:[
    { text:"Un livre de 2 kg est posé à 3 m de hauteur. Quelle est son énergie potentielle? (g=10m/s²)", choices:["30 J","60 J","6 J","15 J"], correct:1,
      ok:"✅ Ep = mgh = 2×10×3 = 60 J.",
      bad:"Énergie potentielle: Ep=mgh = 2kg × 10m/s² × 3m = 60 Joules."},
    { text:"La loi de conservation de l'énergie stipule que:", choices:["L'énergie cinétique est toujours égale à l'énergie potentielle","L'énergie totale d'un système isolé reste constante","L'énergie peut être créée mais pas détruite","L'énergie ne peut que se détruire"], correct:1,
      ok:"✅ Conservation de l'énergie: dans un système isolé, l'énergie totale est CONSTANTE. Elle se transforme mais ne disparaît jamais.",
      bad:"Loi de conservation: l'énergie ne se crée ni ne se détruit, elle se TRANSFORME. Ec+Ep = constante dans un système isolé."}
  ]},

  // ══ CHEMISTRY QUIZZES ══
  q_chem_matter: { title:"États de la Matière", questions:[
    { text:"Lors de la fusion de la glace, la température:", choices:["Augmente continuellement","Reste constante (palier)","Diminue","Varie aléatoirement"], correct:1,
      ok:"✅ Lors d'un changement d'état, la température reste constante (palier). Toute l'énergie sert à briser les liaisons intermoléculaires.",
      bad:"Palier de changement d'état: la température reste CONSTANTE pendant que la glace fond. L'énergie absorbée brise les liaisons entre molécules."},
    { text:"Quel changement d'état correspond au passage liquide→gaz?", choices:["Fusion","Vaporisation/Ébullition","Solidification","Sublimation"], correct:1,
      ok:"✅ Liquide→Gaz = vaporisation (ou ébullition si à la température d'ébullition).",
      bad:"Transitions: Fusion (sol→liq), Vaporisation (liq→gaz), Solidification (liq→sol), Condensation (gaz→liq), Sublimation (sol→gaz)."},
    { text:"La glace carbonique (CO₂ solide) passe directement à l'état gazeux. C'est:", choices:["Fusion","Condensation","Sublimation","Vaporisation"], correct:2,
      ok:"✅ Sublimation = passage direct solide→gaz, sans passer par l'état liquide. La glace carbonique sublime à -78°C!",
      bad:"Sublimation: solide→gaz directement. Exemples: glace carbonique, naphtaline (boules antimites), neige par temps très froid."}
  ]},
  q_chem_react: { title:"Réactions Chimiques", questions:[
    { text:"Équilibrer: H₂ + O₂ → H₂O. Quelle est la version équilibrée?", choices:["H₂+O₂→H₂O","H₂+O₂→2H₂O","2H₂+O₂→2H₂O","2H₂+2O₂→2H₂O"], correct:2,
      ok:"✅ 2H₂+O₂→2H₂O: 4H=4H ✓, 2O=2O ✓. On ne change que les COEFFICIENTS, jamais les indices!",
      bad:"2H₂+O₂→2H₂O. Vérification: gauche: 4H, 2O. Droite: 4H, 2O. ✓ Équilibré!"},
    { text:"La combustion du charbon de bois produit:", choices:["H₂O seulement","CO₂ et énergie","O₂ et C","N₂ et CO"], correct:1,
      ok:"✅ C + O₂ → CO₂ + énergie. La combustion libère de l'énergie (chaleur et lumière) en plus du CO₂!",
      bad:"Combustion du carbone: C + O₂ → CO₂ + énergie thermique. C'est pour ça que le charbon chauffe!"}
  ]},
  q_chem_acids: { title:"Acides & Bases", questions:[
    { text:"Le pH du jus de citron est environ 2. C'est:", choices:["Basique","Neutre","Acide fort","Légèrement basique"], correct:2,
      ok:"✅ pH 2 = très acide (pH < 7 = acide). Le jus de citron est acide → il picote sur une plaie!",
      bad:"pH<7 = acide, pH=7 = neutre, pH>7 = basique. pH 2 = très acide."},
    { text:"Dans la réaction de neutralisation HCl + NaOH → ?, les produits sont:", choices:["H₂ + NaCl","NaCl + H₂O","HNaCl + O","HCl + NaOH (pas de réaction)"], correct:1,
      ok:"✅ Acide + Base → Sel + Eau. HCl + NaOH → NaCl (sel) + H₂O. C'est la neutralisation!",
      bad:"Neutralisation: acide + base → sel + eau. HCl + NaOH → NaCl + H₂O. Le sel de table (NaCl) est produit!"},
    { text:"Le sang humain a un pH de 7.4. C'est:", choices:["Très acide","Très basique","Légèrement basique/neutre","Neutre exact"], correct:2,
      ok:"✅ pH 7.4 = légèrement basique. Le corps maintient ce pH précis (homéostasie) car des variations > ±0.4 peuvent être fatales!",
      bad:"pH 7 = neutre. pH 7.4 = légèrement au-dessus de 7 = légèrement basique. Le corps régule ce pH très précisément."}
  ]},

  // ══ ELA QUIZZES ══
  q_ela_read: { title:"Reading Comprehension", questions:[
    { text:"What does 'main idea' mean in reading comprehension?", choices:["The first sentence of a paragraph","The central message or point of the entire text","The most interesting detail","The author's name"], correct:1,
      ok:"✅ Main idea = the central point the text is making. Supporting details are facts/examples that back it up.",
      bad:"Main idea = the overall message or purpose of the text, not just one sentence. Details support the main idea but are not the main idea themselves."},
    { text:"'Context clues' help you:", choices:["Find the author's contact information","Understand unknown words using surrounding text","Memorize vocabulary faster","Summarize the text"], correct:1,
      ok:"✅ Context clues are words/phrases near an unknown word that hint at its meaning. Use them to figure out vocabulary without a dictionary!",
      bad:"Context clues = hints in the surrounding text that help you guess the meaning of unknown words. Very useful for reading US textbooks!"},
    { text:"Making an inference means:", choices:["Looking up a fact","Reading aloud","Drawing conclusions from evidence not directly stated","Summarizing the plot"], correct:2,
      ok:"✅ Inference = reading between the lines. The text implies something but doesn't state it directly. You use evidence + logic to conclude.",
      bad:"Inference = conclusion based on evidence + reasoning. The text gives clues but doesn't say it directly. 'If it's raining, she'll need an umbrella' — you infer the umbrella, the text didn't say it."}
  ]},
  q_ela_write: { title:"Essay Writing", questions:[
    { text:"A strong thesis statement must include:", choices:["A quote from the text","A question","A topic + position + 3 supporting reasons","The author's biography"], correct:2,
      ok:"✅ Thesis = specific argument + 3 reasons. Weak: 'Climate change is bad.' Strong: 'Climate change threatens Cameroon because it..., ..., and ...'",
      bad:"Thesis statement = topic + your specific claim + 3 reasons to support it. Avoid vague statements — be specific!"},
    { text:"Which transition word shows CONTRAST?", choices:["Furthermore","In addition","However","For example"], correct:2,
      ok:"✅ 'However' shows contrast/contradiction. Furthermore/In addition = adding. For example = illustrating.",
      bad:"Contrast transitions: however, but, on the other hand, nevertheless, yet, although. 'Furthermore' and 'In addition' add more support."}
  ]},
  q_ela_lit: { title:"Literary Analysis", questions:[
    { text:"In 'The dog barked like a thunderstorm,' what literary device is used?", choices:["Metaphor","Simile","Personification","Hyperbole"], correct:1,
      ok:"✅ Simile = comparison using 'like' or 'as'. Metaphor = direct comparison without like/as ('The dog WAS a thunderstorm').",
      bad:"Simile uses 'like' or 'as' to compare. 'Like a thunderstorm' = simile. If it said 'The dog IS thunder' = metaphor."},
    { text:"The climax of a story is:", choices:["The introduction of characters","The turning point of highest tension","The resolution of all conflicts","The setting description"], correct:1,
      ok:"✅ Climax = the moment of highest tension or the turning point where the main conflict peaks. Everything builds to it, then resolves.",
      bad:"Plot structure: exposition → rising action → CLIMAX (peak tension/turning point) → falling action → resolution."}
  ]},
  q_ela_speak: { title:"Public Speaking", questions:[
    { text:"Which type of speech opening (hook) is generally MOST engaging?", choices:["'Today I will talk about...'","A personal anecdote or surprising statistic","Reading from notes directly","'I chose this topic because...'"], correct:1,
      ok:"✅ Personal stories and surprising statistics immediately grab attention. 'Today I will talk about...' is boring — never start a speech this way!",
      bad:"Great hooks: personal story, shocking fact/statistic, rhetorical question, or powerful quote. Never start with 'Today I will talk about...'"},
    { text:"Eye contact in US presentations means:", choices:["Staring at one person the whole time","Looking at the floor","Scanning the audience naturally, 3-5 seconds per person","Reading from your notes always"], correct:2,
      ok:"✅ Natural eye contact: scan the room, pause on individuals for 3-5 seconds, then move on. This shows confidence and connection.",
      bad:"Natural eye contact: move your gaze around the room, briefly resting on different people. Don't stare at one person, don't look at notes constantly."}
  ]},

  // ══ LIFE SCIENCE QUIZZES ══
  q_sci_cell: { title:"La Cellule Vivante", questions:[
    { text:"Quelle organite est appelée 'powerhouse of the cell' (centrale électrique) en US Science?", choices:["Le noyau","Le ribosome","La mitochondrie","Le chloroplaste"], correct:2,
      ok:"✅ La mitochondrie produit l'ATP (énergie cellulaire) par la respiration cellulaire. 'Powerhouse of the cell' = expression incontournable aux USA!",
      bad:"Mitochondrie = 'powerhouse of the cell' = productrice d'ATP (énergie). MÉMORISE cette expression — elle apparaît dans tous les cours de science américains!"},
    { text:"Quelle structure est UNIQUEMENT présente dans les cellules végétales?", choices:["Membrane plasmique","Mitochondrie","Ribosome","Paroi cellulaire + Chloroplastes"], correct:3,
      ok:"✅ Cellule végétale: paroi cellulaire (rigide) + chloroplastes (photosynthèse) + grande vacuole. Cellule animale: aucun de ces trois!",
      bad:"Spécifique aux cellules végétales: paroi cellulaire (cellulose), chloroplastes (photosynthèse), grande vacuole centrale."}
  ]},
  q_sci_gen: { title:"Génétique & ADN", questions:[
    { text:"Dans un croisement Aa × Aa, quel pourcentage d'individus aura le phénotype dominant?", choices:["25%","50%","75%","100%"], correct:2,
      ok:"✅ Carré de Punnett: AA (25%) + Aa (50%) + aa (25%). AA et Aa = phénotype dominant → 75%!",
      bad:"Punnett Aa×Aa → AA:Aa:aa = 1:2:1. AA(dominant)+Aa(dominant)=3/4=75%. Seulement aa (25%) = phénotype récessif."},
    { text:"L'ADN est composé de:", choices:["Acides aminés uniquement","Nucléotides (A, T, C, G)","Lipides et protéines","Glucose et fructose"], correct:1,
      ok:"✅ ADN = Acide DésoxyriboNucléique. Composé de 4 nucléotides: A(adénine), T(thymine), C(cytosine), G(guanine). A s'apparie avec T, C avec G.",
      bad:"ADN = chaîne de nucléotides. 4 bases: Adénine(A)-Thymine(T), Cytosine(C)-Guanine(G). Double hélice = deux brins complémentaires."}
  ]},
  q_sci_eco: { title:"Écosystèmes & Biomes", questions:[
    { text:"Dans une chaîne alimentaire, les producteurs sont:", choices:["Les carnivores","Les herbivores","Les plantes (autotrophes)","Les décomposeurs"], correct:2,
      ok:"✅ Producteurs = plantes et algues (autotrophes): ils PRODUISENT leur propre énergie via la photosynthèse. Tous les autres sont des consommateurs.",
      bad:"Producteurs = autotrophes (plantes, algues) → fabriquent leur énergie (lumière+CO₂+H₂O→glucose). Consommateurs = hétérotrophes (mangent pour vivre)."},
    { text:"Le Cameroun est célèbre pour quelle caractéristique écologique?", choices:["Ses déserts de sable","Sa 2ème plus grande forêt tropicale africaine","Ses plaines arctiques","Sa 1ère barrière de corail"], correct:1,
      ok:"✅ La forêt du Cameroun (Bassin du Congo) est la 2ème plus grande forêt tropicale d'Afrique! Elle stocke des milliards de tonnes de CO₂.",
      bad:"Le Cameroun abrite la 2ème plus grande forêt tropicale africaine (après le Congo). C'est un écosystème d'importance mondiale pour la biodiversité et le climat."}
  ]},
  q_sci_body: { title:"Systèmes du Corps Humain", questions:[
    { text:"Quel système du corps humain transporte l'oxygène vers toutes les cellules?", choices:["Digestif","Nerveux","Circulatoire (cardiovasculaire)","Excréteur"], correct:2,
      ok:"✅ Le système circulatoire (cœur + vaisseaux sanguins) transporte O₂, CO₂, nutriments, hormones, et déchets dans tout le corps.",
      bad:"Système circulatoire: cœur (pompe) + artères (sang oxygéné) + veines (sang désoxygéné) + capillaires. Transporte O₂ vers toutes les cellules."},
    { text:"L'homéostasie désigne:", choices:["La croissance cellulaire","La digestion des protéines","Le maintien de conditions internes stables","La reproduction des cellules"], correct:2,
      ok:"✅ Homéostasie = équilibre interne (température 37°C, pH sanguin 7.4, glycémie...). Le corps corrige en permanence tout déséquilibre.",
      bad:"Homéostasie: capacité du corps à maintenir ses conditions internes stables. Fièvre = mécanisme d'homéostasie (corps monte en T° pour tuer les bactéries)."}
  ]},

  // ══ EARTH & SPACE QUIZZES ══
  q_earth_solar: { title:"Le Système Solaire", questions:[
    { text:"Combien de planètes y a-t-il dans le Système Solaire?", choices:["7","9","8","10"], correct:2,
      ok:"✅ 8 planètes (depuis 2006, Pluton est reclassée en 'planète naine'). Moyen US: My Very Educated Mother Just Served Us Noodles!",
      bad:"8 planètes: Mercure, Vénus, Terre, Mars, Jupiter, Saturne, Uranus, Neptune. Pluton (anciennement 9ème) est maintenant une planète naine."},
    { text:"La lumière du Soleil met environ combien de temps pour atteindre la Terre?", choices:["8 secondes","8 minutes","8 heures","8 jours"], correct:1,
      ok:"✅ 8 minutes! La lumière voyage à 300 000 km/s, mais la Terre est à 150 millions de km du Soleil. 150M/300 000 = 500 secondes ≈ 8 min.",
      bad:"c = 300,000 km/s. Distance Terre-Soleil = 150 millions km. Temps = 150,000,000/300,000 = 500 secondes ≈ 8 minutes et 20 secondes."},
    { text:"What causes the ocean tides?", choices:["Earth's rotation only","The Moon's gravitational pull","Solar wind","Earth's magnetic field"], correct:1,
      ok:"✅ The Moon's gravity pulls on Earth's oceans, creating two high-tide bulges and two low tides daily as Earth rotates.",
      bad:"Tides are caused by the Moon's gravitational pull on Earth's oceans. The Sun also contributes (spring tides = Sun+Moon aligned), but the Moon is the primary cause."}
  ]},
  q_earth_struct: { title:"Structure de la Terre", questions:[
    { text:"Quelle est la couche la plus épaisse de la Terre?", choices:["La croûte","Le manteau","Le noyau externe","Le noyau interne"], correct:1,
      ok:"✅ Le manteau (35-2900 km d'épaisseur) est la couche la plus épaisse. La croûte fait seulement 35 km!",
      bad:"Manteau: 35 km → 2900 km de profondeur = ~2865 km d'épaisseur. C'est la couche la plus volumineuse de la Terre!"},
    { text:"Les tremblements de terre se produisent principalement:", choices:["Au centre des plaques tectoniques","Aux frontières entre les plaques tectoniques","Dans les océans uniquement","Au niveau de la couche d'ozone"], correct:1,
      ok:"✅ Les séismes se produisent aux frontières entre les plaques: zones de subduction, failles transformantes (ex: faille de San Andreas en Californie!)",
      bad:"Frontières de plaques = zones d'activité sismique et volcanique. La faille de San Andreas en Californie est une frontière transformante très active!"}
  ]},
  q_earth_climate: { title:"Changement Climatique", questions:[
    { text:"Quel gaz est le principal responsable de l'effet de serre amplifié?", choices:["O₂","N₂","CO₂","H₂"], correct:2,
      ok:"✅ Le CO₂ (dioxyde de carbone) est le principal GES d'origine humaine. Il est libéré par la combustion des énergies fossiles.",
      bad:"CO₂ = principal gaz à effet de serre d'origine humaine (70% du réchauffement). CH₄ (méthane) est plus puissant mais moins abondant."},
    { text:"Le Lac Tchad (frontière Cameroun/Tchad/Niger/Nigeria) a rétréci de:", choices:["10%","50%","90%","Il n'a pas rétréci"], correct:2,
      ok:"✅ Le Lac Tchad a perdu 90% de sa superficie depuis 1960! C'est l'un des exemples les plus frappants des effets du changement climatique en Afrique.",
      bad:"Le Lac Tchad a rétréci de 90% depuis 1960 — un désastre écologique et humanitaire directement lié au changement climatique et à la surexploitation de l'eau."}
  ]},
  q_earth_weather: { title:"Météorologie", questions:[
    { text:"Quelle est la différence entre 'météo' et 'climat'?", choices:["Il n'y en a pas","Météo = court terme (aujourd'hui), Climat = long terme (décennies)","Météo = température seulement, Climat = tout","Climat = précipitations, Météo = température"], correct:1,
      ok:"✅ Météo = conditions atmosphériques actuelles (aujourd'hui, cette semaine). Climat = moyennes et tendances sur 30+ ans. 'Climate is what you expect, weather is what you get.'",
      bad:"'Climate is what you expect, weather is what you get.' Météo = court terme (jours). Climat = tendances à long terme (décennies/siècles)."},
    { text:"Le numéro d'urgence météo aux USA en cas de tornade est:", choices:["411","611","911","311"], correct:2,
      ok:"✅ 911 pour toutes les urgences aux USA: tornade, incendie, accident, crime. En plus, écoute les alertes NOAA Weather Radio ou l'app Wireless Emergency Alerts sur ton téléphone!",
      bad:"911 = numéro d'urgence universel aux USA (police, pompiers, ambulance). Télécharge aussi l'app FEMA et active les Wireless Emergency Alerts pour les tornades!"}
  ]},

  // ══ US HISTORY QUIZZES ══
  q_hist_rev: { title:"La Révolution Américaine", questions:[
    { text:"Quelle était la principale revendication des colons américains?", choices:["Avoir leur propre roi","'No Taxation Without Representation'","L'indépendance de l'Espagne","Le droit de vote pour les femmes"], correct:1,
      ok:"✅ 'No Taxation Without Representation': les colons refusaient de payer des taxes à l'Angleterre sans avoir de représentants au Parlement britannique.",
      bad:"'No taxation without representation' = pas de taxes sans représentation. Les colons payaient des taxes à l'Angleterre mais n'avaient pas de voix au Parlement."},
    { text:"La Déclaration d'Indépendance des USA a été signée en:", choices:["1776","1787","1620","1812"], correct:0,
      ok:"✅ July 4, 1776 = Independence Day! Les USA fêtent cela chaque année le 4 juillet avec des feux d'artifice.",
      bad:"July 4, 1776 = Déclaration d'Indépendance, rédigée principalement par Thomas Jefferson. Fêtée chaque année le 4 juillet (Independence Day)."}
  ]},
  q_hist_const: { title:"La Constitution Américaine", questions:[
    { text:"Quel amendement interdit l'esclavage aux USA?", choices:["1er Amendement","13e Amendement","14e Amendement","19e Amendement"], correct:1,
      ok:"✅ 13e Amendement (1865) = abolition de l'esclavage. Adopté après la Guerre Civile.",
      bad:"13e Amendement (1865): 'Neither slavery nor involuntary servitude... shall exist within the United States.' Adopté en 1865 après la Guerre Civile."},
    { text:"Quel amendement garantit la liberté d'expression et de religion?", choices:["4e","1er","2e","10e"], correct:1,
      ok:"✅ 1er Amendement: liberté d'expression, de religion, de presse, de réunion pacifique, et de pétition. Le plus connu et utilisé!",
      bad:"1er Amendement = freedoms of speech, religion, press, assembly, petition. Le plus fondamental et le plus souvent invoqué dans les tribunaux américains."}
  ]},
  q_hist_civil: { title:"Guerre Civile Américaine", questions:[
    { text:"La Proclamation d'Émancipation d'Abraham Lincoln (1863) a:", choices:["Déclaré la fin de la guerre","Libéré les esclaves dans les États confédérés","Donné le droit de vote aux Noirs","Aboli légalement l'esclavage dans tout le pays"], correct:1,
      ok:"✅ La Proclamation d'Émancipation (1863) libérait les esclaves dans les États confédérés en rébellion. L'abolition totale viendra avec le 13e Amendement (1865).",
      bad:"Proclamation d'Émancipation: libère les esclaves des États confédérés (mais pas encore légalement dans les États frontière). Le 13e Amendement (1865) abolit définitivement l'esclavage."},
    { text:"La Guerre Civile américaine a opposé:", choices:["USA et Royaume-Uni","USA et France","États du Nord (Union) contre États du Sud (Confédération)","Amérique et Mexique"], correct:2,
      ok:"✅ Guerre Civile (1861-65): Union (Nord, anti-esclavage) vs Confédération (Sud, pro-esclavage). Le Nord a gagné, préservant l'unité nationale.",
      bad:"Guerre Civile = conflit interne entre le Nord (Union, anti-esclavage, Lincoln) et le Sud (Confédération, pro-esclavage). L'Union a gagné en 1865."}
  ]},
  q_hist_cr: { title:"Mouvement des Droits Civiques", questions:[
    { text:"Rosa Parks est célèbre pour avoir:", choices:["Organisé la March on Washington","Refusé de céder sa place dans un bus à Montgomery (1955)","Rédigé le Civil Rights Act","Fondé la NAACP"], correct:1,
      ok:"✅ Rosa Parks, couturière à Montgomery, Alabama, a refusé de céder sa place à un homme blanc dans un bus (1955) → boycott des bus → début du mouvement!",
      bad:"Rosa Parks (1955, Montgomery Alabama): refusa de céder sa place dans le bus. Son arrestation déclencha un boycott de 381 jours qui lança le mouvement des droits civiques."},
    { text:"Le Civil Rights Act de 1964 interdit:", choices:["Le vote des femmes","La discrimination basée sur la race, couleur, religion, sexe, ou origine nationale","L'immigration","Les manifestations publiques"], correct:1,
      ok:"✅ Civil Rights Act (1964) interdit toute discrimination dans les lieux publics, l'emploi, et les programmes fédéraux. Une loi historique!",
      bad:"Civil Rights Act 1964: interdit la discrimination basée sur race, couleur, religion, sexe, ou origine nationale. Signé par Lyndon B. Johnson."}
  ]},
  q_hist_modern: { title:"USA Moderne", questions:[
    { text:"Quelle est la signification du '9/11' aux USA?", choices:["9 novembre = Armistice","11 septembre 2001 = attentats terroristes à New York et Washington","9 janvier = premier jour de l'an","11 septembre 1776 = bataille de Brandywine"], correct:1,
      ok:"✅ 9/11 = September 11, 2001. Attentats d'Al-Qaeda: deux avions dans les tours du WTC (NYC), un au Pentagone, un en Pennsylvanie. 2977 victimes.",
      bad:"En américain: mois/jour. 9/11 = September 11, 2001. Attentats les plus meurtriers sur le sol américain. Ont profondément changé la politique et la société US."},
    { text:"Barack Obama a été élu Président des USA pour la première fois en:", choices:["2000","2004","2008","2012"], correct:2,
      ok:"✅ Barack Obama, élu en 2008 et réélu en 2012, est le 44ème Président et le premier Afro-Américain à occuper ce poste.",
      bad:"Barack Obama: élu en novembre 2008, investi le 20 janvier 2009. 44ème Président, premier Afro-Américain. Réélu en 2012."}
  ]},

  // ══ CIVICS QUIZZES ══
  q_civ_branches: { title:"3 Branches du Gouvernement", questions:[
    { text:"Quelle branche du gouvernement vote les lois aux USA?", choices:["La Cour Suprême","Le Président","Le Congrès (législatif)","Le Gouverneur"], correct:2,
      ok:"✅ Branche législative = Congrès = Sénat + Chambre des Représentants. Ils votent les lois que le Président signe ou oppose son veto.",
      bad:"Congrès (législatif) = Sénat (100) + Chambre des Représentants (435). Ils FONT les lois. Président (exécutif) les APPLIQUE. Cour Suprême (judiciaire) les INTERPRÈTE."},
    { text:"Combien de juges composent la Cour Suprême des USA?", choices:["7","12","9","13"], correct:2,
      ok:"✅ 9 juges à la Cour Suprême (nommés à vie par le Président, confirmés par le Sénat). C'est une question classique du test de citoyenneté!",
      bad:"9 juges à la Cour Suprême américaine. Ils sont nommés à vie (pas d'élection). Ce sont eux qui ont le dernier mot sur la constitutionnalité des lois."}
  ]},
  q_civ_rights: { title:"Droits & Libertés", questions:[
    { text:"Si la police veut fouiller tes affaires sans raison valable, quel amendement te protège?", choices:["1er Amendement","4e Amendement","6e Amendement","14e Amendement"], correct:1,
      ok:"✅ 4e Amendement: protection contre les fouilles et saisies sans 'probable cause' et sans mandat. La police doit avoir une raison valable!",
      bad:"4e Amendement: protège contre les fouilles illégales (sans mandat ou probable cause). Tu peux dire 'I do not consent to a search' même si tu n'as rien à cacher."},
    { text:"Le 14e Amendement est crucial pour les immigrants parce qu'il garantit:", choices:["Le droit de travailler","L'égale protection sous la loi pour TOUTES les personnes","Le droit de vote","La citoyenneté automatique"], correct:1,
      ok:"✅ 14e Amendement: 'égale protection sous la loi' pour toutes les PERSONNES (pas seulement les citoyens). C'est la base des droits des immigrants en droit américain.",
      bad:"14e Amendement: 'equal protection under the law' pour TOUTES LES PERSONNES, pas seulement les citoyens. C'est pour ça que même sans documents, tu as des droits légaux aux USA."}
  ]},
  q_civ_vote: { title:"Vote & Démocratie", questions:[
    { text:"Quel est l'âge minimum pour voter aux USA?", choices:["16 ans","18 ans","21 ans","25 ans"], correct:1,
      ok:"✅ 26e Amendement (1971): droit de vote à 18 ans. Avant 1971, l'âge minimum était 21 ans!",
      bad:"26e Amendement (1971): droit de vote à 18 ans (les jeunes soldats au Vietnam ne pouvaient pas voter alors qu'ils mouraient pour le pays — une injustice corrigée!)."},
    { text:"Combien de votes électoraux faut-il pour gagner la présidence américaine?", choices:["50%+1 du vote populaire","270 votes électoraux","435 votes","100 votes"], correct:1,
      ok:"✅ Electoral College: 538 votes totaux, 270 nécessaires pour gagner. Pas le vote populaire direct — c'est unique au système américain!",
      bad:"270/538 votes électoraux nécessaires. C'est pourquoi un candidat peut gagner le vote populaire (total de voix) mais perdre l'élection (ex: 2016). Système unique aux USA."}
  ]},

  // ══ CS QUIZZES ══
  q_cs_algo: { title:"Algorithmique", questions:[
    { text:"Quel est le résultat de cet algorithme: x=5, y=3, z=x+y, AFFICHER z?", choices:["53","8","15","35"], correct:1,
      ok:"✅ x=5, y=3, z=5+3=8. AFFICHER 8. Simple substitution de variables!",
      bad:"x=5, y=3. z=x+y=5+3=8. AFFICHER z → affiche 8. En programmation, = est une affectation, pas une équation!"},
    { text:"Une boucle POUR i de 1 à 5 s'exécutera combien de fois?", choices:["4 fois","5 fois","6 fois","Infini"], correct:1,
      ok:"✅ POUR i de 1 à 5: i=1, 2, 3, 4, 5 → 5 exécutions. La boucle s'arrête après i=5.",
      bad:"for i in range(1, 6) ou POUR i de 1 à 5: i prend les valeurs 1,2,3,4,5 → 5 exécutions."}
  ]},
  q_cs_python: { title:"Python — Initiation", questions:[
    { text:"Quel est le résultat de: print(3 * 'Amina')?", choices:["'Amina' 3 fois: AminaAminaAmina","9","Erreur","3Amina"], correct:0,
      ok:"✅ En Python, str * int = répétition de la chaîne! 3*'Amina' = 'AminaAminaAmina'. Utile pour créer des séparations: print('='*30)",
      bad:"String repetition: 'hello'*3 = 'hellohellohello'. En Python, multiplier une chaîne par un entier la répète!"},
    { text:"Comment afficher 'Bonjour Amina' si nom='Amina' en Python?", choices:["print('Bonjour' + nom)","print(f'Bonjour {nom}')","Les deux fonctionnent","Aucune des deux"], correct:2,
      ok:"✅ Les deux méthodes fonctionnent! Concaténation (+) et f-strings ({}) sont toutes les deux valides. Les f-strings sont plus modernes et lisibles.",
      bad:"Deux méthodes valides: print('Bonjour ' + nom) ET print(f'Bonjour {nom}'). Les f-strings (Python 3.6+) sont recommandées pour leur lisibilité."},
    { text:"Que fait 'input()' en Python?", choices:["Affiche du texte à l'écran","Reçoit une entrée de l'utilisateur","Calcule une valeur","Crée une liste"], correct:1,
      ok:"✅ input() demande à l'utilisateur de taper quelque chose. input('Ton nom: ') affiche le message et attend la saisie.",
      bad:"input() = lit une entrée clavier de l'utilisateur. print() = affiche du texte. Ce sont les deux commandes I/O de base de Python!"},
    { text:"En Python, quel est le résultat de 17 // 3?", choices:["5.66","6","5","4"], correct:2,
      ok:"✅ // = division entière (floor division). 17÷3=5.66... → 5 (partie entière). 17%3=2 (reste). Ce sont des opérateurs très utiles!",
      bad:"// = division entière. 17//3 = 5 (partie entière de 5.66). 17%3 = 2 (reste). A % B = reste de la division euclidienne."}
  ]},
  q_cs_net: { title:"Internet & Cybersécurité", questions:[
    { text:"Que signifie le 'S' dans HTTPS?", choices:["Simple","Speed","Secure (sécurisé)","Server"], correct:2,
      ok:"✅ HTTPS = HTTP Secure. Le 'S' signifie que la connexion est chiffrée (SSL/TLS). Vérifie TOUJOURS HTTPS avant d'entrer un mot de passe!",
      bad:"HTTPS = HyperText Transfer Protocol SECURE. Les données sont chiffrées. Jamais de données sensibles sur HTTP sans S!"},
    { text:"Une bonne pratique pour sécuriser son compte est:", choices:["Utiliser le même mot de passe partout","Activer l'authentification à 2 facteurs (2FA)","Partager son mot de passe avec des amis","Utiliser son prénom comme mot de passe"], correct:1,
      ok:"✅ 2FA = Authentification à 2 facteurs. Même si quelqu'un vole ton mot de passe, il ne peut pas entrer sans le 2ème facteur (SMS, app authenticator). TOUJOURS activer!",
      bad:"2FA (Two-Factor Authentication) = deux preuves d'identité requises. Active-le sur Gmail, Instagram, WhatsApp, et TOUS tes comptes importants!"}
  ]},
  q_cs_ai: { title:"Intelligence Artificielle", questions:[
    { text:"Le Machine Learning signifie que l'IA:", choices:["Mémorise des réponses programmées","Apprend à partir de données sans être explicitement programmée pour chaque tâche","Copie l'intelligence humaine parfaitement","Cherche dans internet pour trouver des réponses"], correct:1,
      ok:"✅ Machine Learning: l'algorithme APPREND des patterns à partir de données. Pas de règles codées manuellement — l'IA trouve elle-même les patterns!",
      bad:"ML = apprendre à partir de données. L'algorithme voit des millions d'exemples et apprend à généraliser. C'est différent de la programmation traditionnelle (règles explicites)."},
    { text:"ARIA, le tuteur de cette app, utilise quel type d'IA?", choices:["Un moteur de recherche","Un Large Language Model (LLM)","Un algorithme de tri","Une calculatrice avancée"], correct:1,
      ok:"✅ ARIA utilise Claude (Anthropic), un LLM. Les LLMs sont entraînés sur des milliards de textes et génèrent des réponses cohérentes en langage naturel.",
      bad:"LLM (Large Language Model) = modèle d'IA entraîné sur d'énormes quantités de texte. Claude (Anthropic), GPT (OpenAI), et Gemini (Google) sont tous des LLMs."}
  ]},

  // ══ HEALTH QUIZZES ══
  q_hlth_nutr: { title:"Nutrition & Alimentation", questions:[
    { text:"Quel macronutriment est la principale source d'énergie immédiate pour le corps?", choices:["Protéines","Lipides","Glucides (carbohydrates)","Vitamines"], correct:2,
      ok:"✅ Glucides = carburant principal (ATP via glycolyse). Le cerveau fonctionne presque exclusivement au glucose (glucide simple)!",
      bad:"Glucides (sucres, amidon, fibres) = principale source d'énergie immédiate. Les lipides = énergie de réserve (plus lente). Protéines = construction (muscles, enzymes)."},
    { text:"La règle MyPlate recommande que quelle proportion de l'assiette soit consacrée aux fruits et légumes?", choices:["1/4","1/3","1/2","3/4"], correct:2,
      ok:"✅ MyPlate: ½ assiette fruits+légumes, ¼ protéines, ¼ céréales. Plus de la moitié doit être des végétaux!",
      bad:"MyPlate USDA: 1/2 fruits et légumes + 1/4 protéines + 1/4 céréales (grains) + portion laitière. La moitié = fruits et légumes!"}
  ]},
  q_hlth_first: { title:"Premiers Secours", questions:[
    { text:"En cas d'urgence aux USA, quel numéro appeler?", choices:["17","18","15","911"], correct:3,
      ok:"✅ 911 = urgences USA (police + pompiers + ambulance). GRATUIT, fonctionne même sans crédit ou carte SIM. Connais ce numéro par cœur!",
      bad:"911 = numéro d'urgence universel aux USA. 17=police au Cameroun, 15=SAMU, 18=pompiers. Mais aux USA: TOUT = 911."},
    { text:"En cas de brûlure légère, que faire en PREMIER?", choices:["Appliquer du beurre ou de l'huile","Mettre de la pâte dentifrice","Refroidir sous eau froide 10 minutes","Frotter avec un tissu sec"], correct:2,
      ok:"✅ Eau froide courante pendant 10 minutes. JAMAIS de beurre, huile, pâte dentifrice (retiennent la chaleur et favorisent les infections!)",
      bad:"Brûlure: eau froide courante 10 minutes. JAMAIS de corps gras (beurre, huile) — cela retient la chaleur et risque d'infecter. Pansement propre après refroidissement."}
  ]},
  q_hlth_teen: { title:"Adolescence & Santé", questions:[
    { text:"Combien d'heures de sommeil les adolescents ont-ils besoin par nuit?", choices:["5-6 heures","6-7 heures","8-10 heures","12 heures ou plus"], correct:2,
      ok:"✅ OMS: 8-10 heures pour les 13-18 ans. Le cerveau ado se développe pendant le sommeil — le manquer = moins de mémoire et de concentration à l'école!",
      bad:"Adolescents = 8-10h de sommeil recommandées (OMS). Manque chronique de sommeil → difficultés d'apprentissage, irritabilité, système immunitaire affaibli, risque d'obésité accru."},
    { text:"Pour suivre son cycle menstruel, que recommande-t-on?", choices:["Rien, c'est inutile","Une app comme Clue ou Flo","Un médecin seulement peut le faire","Uniquement un calendrier papier"], correct:1,
      ok:"✅ Des apps dédiées (Clue, Flo, Period Tracker) permettent de suivre son cycle, prédire les prochaines règles, noter les symptômes. Privées et gratuites!",
      bad:"Apps de suivi menstruel (Clue, Flo) = outils pratiques, privés, gratuits. Permettent de connaître son cycle, prédire les règles, noter douleurs/humeurs."}
  ]},

  // ══ FINANCE QUIZZES ══
  q_fin_bank: { title:"Compte Bancaire", questions:[
    { text:"La différence entre une carte de DÉBIT et une carte de CRÉDIT est:", choices:["Elles sont identiques","Débit = ton propre argent; Crédit = argent emprunté avec intérêts possibles","Crédit est plus sûre","Débit s'utilise seulement en ligne"], correct:1,
      ok:"✅ Débit = TON argent (débité immédiatement). Crédit = argent emprunté à la banque (à rembourser, avec intérêts si pas payé en entier chaque mois!).",
      bad:"Débit: tu dépenses ton propre argent directement. Crédit: la banque prête et tu rembourses. Si pas remboursé intégralement → intérêts (souvent 20%+/an!)."},
    { text:"Qu'est-ce que le 'routing number' d'une banque américaine?", choices:["Ton mot de passe de banque","Un code à 9 chiffres identifiant la banque pour les virements","Le numéro de ta carte","Ton solde actuel"], correct:1,
      ok:"✅ Routing number (9 chiffres) = identifie la banque. Account number = identifie TON compte. Ensemble, ils permettent les virements directs (direct deposit).",
      bad:"Routing number: 9 chiffres identifiant la banque (ex: Wells Fargo = 121042882). Account number: identifie ton compte personnel. Nécessaires pour direct deposit et virements."}
  ]},
  q_fin_budget: { title:"Budget & Épargne", questions:[
    { text:"Dans la règle 50/30/20, quel pourcentage est consacré à l'épargne?", choices:["50%","30%","20%","10%"], correct:2,
      ok:"✅ 50/30/20: 50% besoins, 30% envies, 20% épargne. L'épargne en PREMIER (pay yourself first!) avant les envies.",
      bad:"Règle 50/30/20: 50% nécessités (loyer, nourriture), 30% envies (loisirs, extras), 20% épargne. Épargne en priorité!"},
    { text:"Qu'est-ce qu'un 'fonds d'urgence'?", choices:["Argent pour les vacances","3-6 mois de dépenses en réserve pour imprévus","Un compte d'investissement","L'argent pour les achats impulsifs"], correct:1,
      ok:"✅ Fonds d'urgence = 3-6 mois de dépenses gardées en sécurité pour les vraies urgences (perte d'emploi, maladie, réparation voiture). Priorité absolue!",
      bad:"Emergency fund: 3-6 mois de dépenses mensuelles. Ne pas y toucher sauf vraie urgence. Sans ce fonds, une urgence = dettes!"}
  ]},
  q_fin_schol: { title:"Bourses d'Études", questions:[
    { text:"Un 'grant' (en aide financière universitaire) est:", choices:["Un prêt à rembourser","De l'argent gratuit basé sur les besoins (à NE PAS rembourser)","Un travail à temps partiel","Un programme d'emploi campus"], correct:1,
      ok:"✅ Grant = argent gratuit (need-based). Le Pell Grant donne jusqu'à $7,395/an aux étudiants dans le besoin. JAMAIS à rembourser!",
      bad:"Grant = aide financière GRATUITE (need-based). Scholarship = GRATUIT (merit-based). Loan = EMPRUNT (à rembourser). Work-Study = TRAVAIL rémunéré. Priorité: grants et scholarships!"},
    { text:"La FAFSA (Free Application for Federal Student Aid) doit être soumise:", choices:["Avant le lycée","Dès le 1er octobre de la terminale (12th grade)","Après avoir reçu l'admission universitaire","Pendant la première année universitaire"], correct:1,
      ok:"✅ FAFSA ouvre le 1er octobre de ta dernière année de lycée. Soumets-la LE PLUS TÔT POSSIBLE — les aides sont souvent 'first come, first served'!",
      bad:"FAFSA = Free Application for Federal Student Aid. Ouvre 1er octobre de ta terminale (12th grade). Soumets immédiatement! Certaines aides sont limitées (first come, first served)."}
  ]},

  // ══ ART QUIZZES ══
  q_art_hist: { title:"Histoire de l'Art", questions:[
    { text:"Quel mouvement artistique Picasso a-t-il fondé, directement inspiré par l'art africain?", choices:["L'Impressionnisme","Le Surréalisme","Le Cubisme","Le Romantisme"], correct:2,
      ok:"✅ Cubisme (Picasso, Braque): inspiration directe des masques africains vus au Musée du Trocadéro (Paris, 1907). L'art africain a créé l'art moderne!",
      bad:"Cubisme = mouvement fondé par Picasso et Braque, directement inspiré par les masques africains. 'Les Demoiselles d'Avignon' (1907) marque le début du Cubisme."},
    { text:"La période de la Renaissance se caractérise par:", choices:["L'art abstrait et non représentatif","Le retour à l'idéal greco-romain, perspective, humanisme","La peinture impressionniste de la lumière","L'art conceptuel contemporain"], correct:1,
      ok:"✅ Renaissance (14e-17e s.): retour aux idéaux de l'Antiquité, maîtrise de la perspective, représentation réaliste du corps humain. Da Vinci, Michel-Ange, Raphaël!",
      bad:"Renaissance: humanism + perspective + réalisme + retour à l'Antiquité. Léonard da Vinci (Mona Lisa), Michel-Ange (Sixtine, David), Raphaël."}
  ]},
  q_art_music: { title:"Musique Américaine", questions:[
    { text:"Quelle ville américaine est considérée comme le berceau du Jazz?", choices:["New York","Chicago","New Orleans","Los Angeles"], correct:2,
      ok:"✅ New Orleans (Louisiane) = berceau du Jazz. Mélange de blues, ragtime, musiques africaines et créoles. Louis Armstrong est né là!",
      bad:"New Orleans = berceau du Jazz (1900s). Mélange de blues afro-américain, ragtime, brass bands, et musiques caribéennes. Louis Armstrong y a grandi!"},
    { text:"Le Hip-Hop est né dans quel quartier de New York dans les années 1970?", choices:["Manhattan","Brooklyn","The Bronx","Queens"], correct:2,
      ok:"✅ Le Bronx, NYC, fin des années 1970. Fondateurs: DJ Kool Herc, Afrika Bambaataa, Grandmaster Flash. Culture: MCing, DJing, breakdancing, graffiti.",
      bad:"Hip-Hop né dans le Bronx (NYC) ~1973. Fondé par DJ Kool Herc (Jamaïcain!), Afrika Bambaataa, Grandmaster Flash. Expression culturelle afro-américaine et caribéenne."}
  ]},
  q_art_africa: { title:"Arts Africains & Diaspora", questions:[
    { text:"Les masques Bamiléké du Cameroun sont caractéristiques par:", choices:["Leurs grandes ailes en bois","Leurs ornements de perles et plumes symbolisant la royauté","Leur couleur bleue uniforme","Leur taille miniature"], correct:1,
      ok:"✅ Masques Bamiléké = ornements de perles (odontol) et plumes, réservés aux cérémonies royales. Parmi les arts africains les plus reconnus mondialement!",
      bad:"Masques Bamiléké: recouverts de perles (odontol) colorées et plumes. Symboles de pouvoir royal dans les chefferies de l'Ouest Cameroun. Exposés dans les grands musées mondiaux!"},
    { text:"Kehinde Wiley est connu pour:", choices:["Avoir créé le jazz","Être le 1er Président Afro-Américain","Avoir peint le portrait officiel de Barack Obama","Avoir sculpté la Statue de la Liberté"], correct:2,
      ok:"✅ Kehinde Wiley (Afro-Américain, racines nigérianes) a peint le portrait officiel de Barack Obama pour la National Portrait Gallery (2018). Peintre de renommée mondiale!",
      bad:"Kehinde Wiley = peintre américain d'origines nigérianes. Son portrait de Barack Obama (2018, National Portrait Gallery Washington DC) est l'un des plus vus au monde."}
  ]},

  // ══ FRENCH QUIZZES ══
  q_fr_gram: { title:"Grammaire & Rédaction FR", questions:[
    { text:"Dans le plan dialectique d'une dissertation, l'ordre correct est:", choices:["Antithèse → Thèse → Synthèse","Thèse → Antithèse → Synthèse","Synthèse → Thèse → Antithèse","Thèse → Synthèse → Antithèse"], correct:1,
      ok:"✅ Plan dialectique: Thèse (affirme) → Antithèse (nuance/contredit) → Synthèse (dépasse les deux). La synthèse EST la conclusion!",
      bad:"Plan dialectique: THÈSE (idée défendue) → ANTITHÈSE (objections, nuances) → SYNTHÈSE (dépassement, conclusion). Classique de la dissertation française."},
    { text:"'Bien que tu SOIS brillante' utilise quel mode verbal?", choices:["Indicatif","Subjonctif","Conditionnel","Infinitif"], correct:1,
      ok:"✅ 'Bien que' exige le subjonctif. 'être' au subjonctif présent = 'sois'. Autres expressions + subjonctif: il faut que, pour que, avant que, quoique...",
      bad:"Subjonctif présent de 'être': je sois, tu sois, il soit, nous soyons... Obligatoire après: bien que, pour que, il faut que, avant que, etc."}
  ]},
  q_fr_lit: { title:"Littérature Francophone", questions:[
    { text:"Ferdinand Oyono est l'auteur camerounais de:", choices:["'Mission Terminée'","'Une Vie de Boy'","'L'intérieur de la nuit'","'Tu t'appelleras Tanga'"], correct:1,
      ok:"✅ Ferdinand Oyono (1929-2010): 'Une Vie de Boy' (1956) et 'Le Vieux Nègre et la Médaille' — chefs-d'œuvre de la littérature africaine francophone anti-coloniale.",
      bad:"Ferdinand Oyono: 'Une Vie de Boy' (1956) et 'Le Vieux Nègre et la Médaille'. Mongo Beti: 'Mission Terminée'. Léonora Miano: 'L'intérieur de la nuit'."},
    { text:"Combien de personnes parlent français dans le monde?", choices:["Environ 75 millions","Environ 150 millions","Environ 300 millions","Environ 1 milliard"], correct:2,
      ok:"✅ 300+ millions de francophones dans 87 pays! Et d'ici 2050, 85% des francophones seront africains. Le français est LA langue d'avenir de l'Afrique!",
      bad:"~300 millions de francophones dans 87 pays membres de l'OIF. D'ici 2050: l'Afrique comptera 85% des locuteurs mondiaux de français → ta langue prend de la valeur!"}
  ]},
  q_fr_asset: { title:"Français comme Atout", questions:[
    { text:"Le DELF est:", choices:["Un diplôme allemand","Le Diplôme d'Études en Langue Française — certification internationale","Un programme universitaire","Un test d'anglais"], correct:1,
      ok:"✅ DELF = Diplôme d'Études en Langue Française, délivré par le Ministère de l'Éducation française. Reconnu dans 175 pays, passable dans les centres DELF partout dans le monde (y compris aux USA).",
      bad:"DELF: Diplôme d'Études en Langue Française. Niveaux: A1, A2, B1, B2 (pour toi maintenant!), DALF C1, C2 (universitaire). Reconnu internationalement."},
    { text:"Quelle organisation internationale basée à New York a le FRANÇAIS comme langue officielle?", choices:["Le Parlement Européen","L'Organisation des Nations Unies (ONU)","La Banque Mondiale seulement","L'OTAN"], correct:1,
      ok:"✅ L'ONU a 6 langues officielles: Arabe, Chinois, Anglais, Français, Russe, Espagnol. Parler français ouvre les portes de la diplomatie internationale!",
      bad:"L'ONU a 6 langues officielles: Arabe, Chinois, Anglais, Français, Russe, Espagnol. Le français est essentiel pour une carrière à l'ONU, UNESCO, UNICEF, et autres agences."}
  ]},

  // ══ INTEGRATION QUIZZES ══
  q_int_social: { title:"Vie Sociale Américaine", questions:[
    { text:"Quand un Américain dit 'How are you?', il attend généralement:", choices:["Une réponse détaillée sur ta santé","Juste 'Good, thanks! You?'","Aucune réponse","Une discussion approfondie"], correct:1,
      ok:"✅ 'How are you?' = salutation de politesse aux USA. Réponse standard: 'Good, thanks! How are you?' ou 'Fine, thanks!'. Ce n'est pas une vraie question sur ta santé!",
      bad:"'How are you?' = formule de politesse américaine. Réponse attendue: 'Good, thanks! How about you?' Pas une vraie question médicale — c'est juste un bonjour élaboré!"},
    { text:"Que signifie le slang américain 'No cap'?", choices:["'Pas de casquette'","'Pour de vrai, sans mentir'","'Fin de discussion'","'Je ne comprends pas'"], correct:1,
      ok:"✅ 'No cap' = pour de vrai, sérieusement, sans blague! 'That party was amazing, no cap!' = C'était vraiment une soirée incroyable!",
      bad:"'No cap' = pour de vrai, sans mentir. Autres slang: lit (super cool), bet (ok/d'accord), slay (réussir parfaitement), vibe (ambiance), lowkey (un peu/discrètement)."}
  ]},
  q_int_transport: { title:"Transport & Sécurité", questions:[
    { text:"En cas d'urgence aux USA (accident, danger), tu dois appeler:", choices:["911","112","999","17"], correct:0,
      ok:"✅ 911 = numéro d'urgence universel aux USA. GRATUIT, fonctionne même sans crédit téléphonique. Connais ce numéro par cœur!",
      bad:"911 aux USA = tout (police + ambulance + pompiers). Gratuit, même sans crédit. 112 = Europe, 999 = UK, 17 = Police au Cameroun."},
    { text:"Traverser la route aux USA se fait:", choices:["N'importe où si la voie est libre","Uniquement aux passages piétons avec le signal vert (Walk)","À gauche (sens de conduite US)","Seulement aux carrefours majeurs"], correct:1,
      ok:"✅ Traverse UNIQUEMENT aux passages piétons avec le signal 'Walk' (vert). L'amende pour 'jaywalking' (traverser hors passage piéton) peut aller jusqu'à $250!",
      bad:"Jaywalking (traverser hors passage piéton) est une infraction aux USA → amende. Attends toujours le signal 'Walk'. Regarde des deux côtés — certains États conduisent en sens inverse!"}
  ]},
  q_int_health: { title:"Santé & Assurance aux USA", questions:[
    { text:"Medicaid est:", choices:["Une assurance privée chère","Un programme gouvernemental de santé GRATUIT/low-cost pour familles à faibles revenus","Un médicament","Un hôpital"], correct:1,
      ok:"✅ Medicaid = programme gouvernemental de santé pour personnes à faibles revenus. GRATUIT ou quasi-gratuit. Inscris-toi si ta famille est éligible!",
      bad:"Medicaid = assurance santé gouvernementale (fédérale+état) pour familles à faibles revenus. Gratuite ou très peu chère. Cherche si tu y as droit sur healthcare.gov!"},
    { text:"Avant d'entrer dans une école américaine, quels documents médicaux sont souvent requis?", choices:["Passeport seulement","Carte scolaire camerounaise","Carnet de vaccination à jour (MMR, Varicelle, Hépatite B, Tdap...)","Résultats de tes examens scolaires"], correct:2,
      ok:"✅ Les écoles US exigent des vaccinations à jour: MMR (rougeole), Varicelle, Hépatite B, Tdap (tétanos, diphtérie, coqueluche), Méningocoque...",
      bad:"Vaccins obligatoires pour l'école US: MMR, Varicelle, Hépatite B, Tdap, Méningocoque (parfois). Traduis ton carnet en anglais AVANT d'arriver ou consulte un médecin dès l'arrivée."}
  ]},
  q_int_college: { title:"Préparation Universitaire", questions:[
    { text:"Le SAT est un examen qui évalue:", choices:["Ton niveau de français","Math + Reading/Writing (score max 1600)","Tes compétences sportives","Uniquement tes connaissances historiques"], correct:1,
      ok:"✅ SAT = Scholastic Assessment Test. Math (800 pts) + Evidence-Based Reading & Writing (800 pts) = 1600 max. Préparation gratuite sur khanacademy.org!",
      bad:"SAT: Math (800) + Evidence-Based Reading/Writing (800) = 1600 points maximum. Universite et bourse-based. Prépare-toi gratuitement sur khanacademy.org/sat."},
    { text:"La Common App est:", choices:["Une application mobile de covoiturage","Une plateforme de candidature unique pour 900+ universités américaines","Un programme de bourses","Un test d'admission"], correct:1,
      ok:"✅ Common Application (commonapp.org) = plateforme unique pour postuler à 900+ universités américaines avec UN SEUL formulaire. S'ouvre en août de ta terminale!",
      bad:"Common App = commmonapp.org. Une candidature → 900+ universités. Tu remplis ton profil une fois, tu choisis tes universités, tu paies les frais par école. S'ouvre août/septembre."},
    { text:"Quand doit-on soumettre la FAFSA (aide financière) idéalement?", choices:["En janvier de l'année de terminale","Le plus tôt possible après le 1er octobre de l'année de terminale","Après avoir reçu l'admission","2 ans avant l'université"], correct:1,
      ok:"✅ FAFSA ouvre le 1er octobre. Soumets-la IMMÉDIATEMENT — les aides financières sont souvent limitées (first come, first served)!",
      bad:"FAFSA: ouvre le 1er octobre de ta dernière année de lycée. Soumets dès que possible! Certains fonds sont épuisés vite. Ne rate pas cette deadline cruciale."}
  ]},

  // ══ PE QUIZZES ══
  q_pe_sports: { title:"Sports Américains", questions:[
    { text:"Le 'Super Bowl' est le championnat de quel sport américain?", choices:["Baseball","Soccer","Basketball","Football américain"], correct:3,
      ok:"✅ Super Bowl = championnat NFL (National Football League = football américain). Se joue en février, regarde par ~100 millions d'Américains!",
      bad:"Super Bowl = finale du NFL (football américain, pas soccer!). C'est l'événement télévisé le plus regardé aux USA chaque année. Mi-temps = spectacle musical gigantesque!"},
    { text:"Le 'Title IX' est une loi américaine qui garantit:", choices:["Le droit de porter des casques au foot","L'égalité de traitement hommes/femmes dans les sports scolaires","Le droit de regarder le sport à l'école","La création d'équipes mixtes obligatoires"], correct:1,
      ok:"✅ Title IX (1972): interdit la discrimination basée sur le sexe dans tout programme éducatif bénéficiant de financement fédéral → équipes féminines dans toutes les écoles!",
      bad:"Title IX (1972): égalité des sexes dans les programmes éducatifs → budget égal pour sports féminins et masculins, autant d'équipes, mêmes équipements. Profite de ces équipes!"}
  ]},
  q_pe_fit: { title:"Fitness & Bien-être", questions:[
    { text:"L'OMS recommande pour les adolescents:", choices:["30 min de marche par semaine","60 min d'activité physique par JOUR","2 heures de sport le weekend seulement","15 minutes d'exercice par jour"], correct:1,
      ok:"✅ OMS pour les 5-17 ans: 60 minutes d'activité physique MODÉRÉE À INTENSE par jour. La moitié des ados mondials n'atteignent pas cet objectif!",
      bad:"OMS Ados (5-17 ans): 60 minutes d'activité physique par JOUR. Activité aérobie modérée (vélo, marche rapide) + renforcement musculaire 3x/semaine minimum."},
    { text:"Quel est l'effet prouvé du sport sur la santé mentale?", choices:["Aucun effet","Augmente l'anxiété","Libère des endorphines qui améliorent l'humeur et réduisent le stress","Rend somnolent seulement"], correct:2,
      ok:"✅ L'exercice libère endorphines (bien-être), sérotonine (humeur), et BDNF (croissance neuronale). 30 min de marche = efficacité antidépressive prouvée!",
      bad:"Exercice → endorphines + sérotonine + BDNF = moins de stress, meilleure humeur, meilleure mémoire. Études prouvent: 30 min de marche = effet d'un antidépresseur léger!"}
  ]},

};

// ══════════════════════════════════════════
// AUTH SYSTEM
// ══════════════════════════════════════════
let DB = { users:[], currentUserId:null };
let currentUser = null;
let selectedRole = 'student';
let obAvatar = '👩🏾‍🔬';
let obCareer = 'Ingénieure / Engineer';
let obPhoto = '';

// ── Quiz session: track last quiz key to prevent same test twice in a row ──
let _lastQuizKey = null;

// ── Puzzle session state ──
let _puzzleSubject = null;
let _puzzleLetterOrder = [];
let _puzzleAnswer = [];
let _puzzleWord = '';
let _puzzleHintUsed = false;
let _puzzleIndex = 0; // which puzzle within the day

// ── Messaging state ──
let msgTargetId = null;
let _msgViewMode = 'contacts'; // 'contacts' | 'thread'

// ── Fisher-Yates shuffle (returns new shuffled array) ──
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Seeded pseudo-random (deterministic per day+subject for puzzles) ──
// Uses the Knuth multiplicative LCG (linear congruential generator) with
// multiplier 1664525 and increment 1013904223 — the constants from Numerical
// Recipes (Knuth vol. 2) that produce a full-period sequence over 2^32.
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  };
}

// ── Motivational emoji overlay ──
const CORRECT_EMOJIS  = ['🎉','🚀','⭐','🏆','💫','✨','👏','🔥'];
const WRONG_EMOJIS    = ['💪','😊','🌱','💡','🤔','📚','🎯','🌟'];
const COMPLETE_EMOJIS = ['🎓','🏅','🌈','🎊','🥳','👑','💎','🚀'];

function showEmojiReaction(type) {
  const overlay = document.getElementById('emoji-overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  overlay.classList.remove('hidden');

  let emojis, cssClass;
  if (type === 'correct') {
    emojis = CORRECT_EMOJIS; cssClass = 'emoji-burst emoji-correct';
  } else if (type === 'wrong') {
    emojis = WRONG_EMOJIS; cssClass = 'emoji-float emoji-wrong';
  } else {
    emojis = COMPLETE_EMOJIS; cssClass = 'emoji-burst emoji-complete';
  }

  const emoji = emojis[Math.floor(Math.random() * emojis.length)];
  const el = document.createElement('div');
  el.className = cssClass;
  el.textContent = emoji;
  overlay.appendChild(el);

  // For 'correct': also scatter a few small emojis
  if (type === 'correct') {
    for (let i = 0; i < 4; i++) {
      const floater = document.createElement('div');
      floater.style.cssText = `position:fixed;font-size:${22+Math.random()*18}px;left:${15+Math.random()*70}%;top:${20+Math.random()*50}%;animation:emojiFloat ${0.9+Math.random()*0.8}s ease-out ${i*0.12}s both;z-index:9999;pointer-events:none`;
      floater.textContent = CORRECT_EMOJIS[Math.floor(Math.random() * CORRECT_EMOJIS.length)];
      overlay.appendChild(floater);
    }
  }

  setTimeout(() => { overlay.classList.add('hidden'); overlay.innerHTML = ''; }, 1800);
}

async function loadDB(){
  // Attempt to restore session via the httpOnly refresh-token cookie
  const restored = await _tryRefresh();
  if (!restored) {
    // No active session — showScreen('auth') is the default initial state
    return;
  }
  // currentUser is populated by _tryRefresh → _hydrateFromServer
  afterLogin();
}

function saveDB(){
  if (!currentUser || !_accessToken) return;
  // Sync mutable user state to the backend (fire-and-forget)
  _apiCall('PATCH', '/users/me', {
    xp:               currentUser.xp,
    level:            currentUser.level,
    streak:           currentUser.streak,
    lastStudy:        currentUser.lastStudy,
    englishLevel:     currentUser.englishLevel,
    subjectScores:    currentUser.subjectScores,
    badges:           currentUser.badges,
    completedLessons: currentUser.completedLessons,
    questsDone:       currentUser.questsDone,
    placementDone:    currentUser.placementDone,
    completedOnboard: currentUser.completedOnboard,
    avatar:           currentUser.avatar,
    career:           currentUser.career,
    lang:             currentUser.lang,
    reminderTime:     currentUser.reminderTime,
  }).catch(() => {});
}

function genId(){ return 'u_' + Date.now() + Math.random().toString(36).substr(2,6); }
function genCode(name){ return (name.substring(0,3).toUpperCase() + '-' + Math.floor(1000+Math.random()*8999)); }

function setAuthTab(tab){
  document.querySelectorAll('.auth-tab').forEach((t,i) => t.classList.toggle('active', (i===0) === (tab==='login')));
  document.getElementById('login-form').style.display = tab === 'login' ? 'flex' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'flex' : 'none';
}

function selectRole(el){
  document.querySelectorAll('#role-grid .role-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  selectedRole = el.dataset.role;
  document.getElementById('student-extra').style.display = selectedRole === 'student' ? 'flex' : 'none';
  document.getElementById('guardian-extra').style.display = selectedRole !== 'student' ? 'flex' : 'none';
}

async function doRegister(){
  const fname = document.getElementById('reg-fname').value.trim();
  const lname = document.getElementById('reg-lname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pw = document.getElementById('reg-pw').value;
  if(!fname||!email||!pw||pw.length<8){
    showToast('Remplis tous les champs (mot de passe: 8+ car.)','warn'); return;
  }
  try {
    const res = await _apiCall('POST', '/auth/register', {
      fname, lname, email, password: pw, role: selectedRole,
      career: 'Ingénieure',
      parentEmail: selectedRole==='student'
        ? (document.getElementById('reg-parent-email')?.value || '')
        : email,
      studentCode: selectedRole !== 'student'
        ? (document.getElementById('reg-student-code')?.value.trim() || undefined)
        : undefined,
    });
    const data = await res.json();
    if(!res.ok){ showToast(data.error || 'Erreur inscription','warn'); return; }
    _accessToken = data.accessToken;
    _hydrateFromServer(data.user);
    if(selectedRole === 'student'){
      document.getElementById('ob-student-code').textContent = data.user.code;
      showScreen('onboard');
    } else {
      afterLogin();
    }
  } catch(e) {
    showToast('Erreur réseau — réessaie','warn');
  }
}

async function doLogin(){
  const email = document.getElementById('login-email').value.trim();
  const pw = document.getElementById('login-pw').value;
  if(!email||!pw){ showToast('Email et mot de passe requis','warn'); return; }
  try {
    const res = await _apiCall('POST', '/auth/login', { email, password: pw });
    const data = await res.json();
    if(!res.ok){ showToast(data.error || 'Email ou mot de passe incorrect','warn'); return; }
    _accessToken = data.accessToken;
    _hydrateFromServer(data.user);
    afterLogin();
  } catch(e) {
    showToast('Erreur réseau — réessaie','warn');
  }
}

async function demoLogin(role){
  try {
    const res = await _apiCall('POST', `/auth/demo/${role}`, {});
    const data = await res.json();
    if(!res.ok){ showToast(data.error || 'Erreur démo','warn'); return; }
    _accessToken = data.accessToken;
    _hydrateFromServer(data.user);
    if(role==='student' && !data.user.completedOnboard){
      document.getElementById('ob-student-code').textContent = data.user.code;
      showScreen('onboard');
    } else {
      afterLogin();
    }
  } catch(e) {
    showToast('Erreur réseau — réessaie','warn');
  }
}

function afterLogin(){
  setTimeout(requestNotifPermission, 2000);
  if(currentUser.role === 'admin') {
    renderAdmin();
    showScreen('admin');
    return;
  }
  if(currentUser.role === 'student') {
    if(!currentUser.placementDone) {
      goTo('home');
      setTimeout(() => startPlacement(), 500);
    } else {
      goTo('home');
    }
  } else goParentDash();
}

async function doLogout(){
  await _apiCall('POST', '/auth/logout', {}).catch(() => {});
  _accessToken = null;
  DB.currentUserId = null;
  DB.users = [];
  DB.messages = {};
  currentUser = null;
  showScreen('auth');
  document.getElementById('bottom-nav').classList.remove('visible');
}

// ══════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════
function pickAvatar(el){
  document.querySelectorAll('#avatar-grid .role-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  obAvatar = el.dataset.av;
}

function pickCareer(el){
  document.querySelectorAll('#career-grid .role-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  obCareer = el.dataset.career;
}

function handlePhoto(input){
  const file = input.files[0];
  if(!file) return;
  const r = new FileReader();
  r.onload = e => { obPhoto = e.target.result; document.getElementById('photo-prev').innerHTML=`<img src="${obPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`; };
  r.readAsDataURL(file);
}

function finishOnboard(){
  if(!currentUser) return;
  currentUser.avatar = obAvatar;
  currentUser.photo = obPhoto;
  currentUser.career = obCareer;
  currentUser.reminderTime = document.getElementById('ob-time').value || '18:00';
  currentUser.completedOnboard = true;
  currentUser.streak = 1;
  currentUser.lastStudy = new Date().toISOString();
  saveDB();
  scheduleNotifications();
  setTimeout(requestNotifPermission, 2000);
  if(!currentUser.placementDone) {
    goTo('home');
    setTimeout(() => startPlacement(), 500);
  } else {
    goTo('home');
  }
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
let history2 = [];
let currentScreen2 = 'auth';
let currentSubject = null;
let currentLesson = null;
let currentLang = 'fr';

function goTo(name){
  if(currentScreen2===name) return;
  history2.push(currentScreen2);
  showScreen(name);
  if(name==='aria') setTimeout(initChat, 100);
}

function goBack(){
  const prev = history2.pop() || 'home';
  showScreen(prev);
}

function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById('screen-'+name);
  if(el) el.classList.add('active');
  currentScreen2 = name;

  const studentScreens = ['home','progress','aria','settings','vocab','leader','calendar','msg','puzzle'];
  document.getElementById('bottom-nav').classList.toggle('visible', studentScreens.includes(name) && currentUser?.role==='student');
  // Update active nav button
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navMap = {home:'nav-home',progress:'nav-progress',aria:'nav-aria',vocab:'nav-vocab'};
  if(navMap[name]) { const el=document.getElementById(navMap[name]); if(el) el.classList.add('active'); }
  // Show/hide pomodoro btn in lesson/quiz screens
  const pomScreens = ['lesson','quiz'];
  const pomBtn = document.getElementById('pomodoro-btn');
  if(pomBtn) pomBtn.style.display = pomScreens.includes(name) ? 'block' : 'none';
  // Close more menu on any nav
  const mm = document.getElementById('more-menu');
  if(mm) mm.style.display = 'none';
  // Screen-specific init
  if(name==='vocab') renderVocab();
  if(name==='leader') renderLeaderboard();
  if(name==='calendar') renderCalendar();
  if(name==='msg') { _msgViewMode = 'contacts'; renderMessages(); }
  if(name==='puzzle') renderPuzzle();

  if(name==='home') renderHome();
  if(name==='progress') renderProgress();
  if(name==='settings') renderSettings();
}

// ══════════════════════════════════════════
// ENGLISH LEVEL SYSTEM
// ══════════════════════════════════════════
function getEnStage(pct){
  return EN_STAGES.find(s=>pct>=s.min && pct<s.max) || EN_STAGES[EN_STAGES.length-1];
}

function calcEnglishLevel(){
  if(!currentUser) return 0;
  let score = currentUser.englishLevel || 0;
  // Boost from English subject quizzes
  const engQuizzes = (currentUser.quizHistory||[]).filter(q=>q.lesson?.includes('ela')||q.lesson?.includes('ela'));
  if(engQuizzes.length>0){
    const avgEng = engQuizzes.reduce((s,q)=>s+q.score,0)/engQuizzes.length;
    score = Math.max(score, avgEng * 0.6);
  }
  // Boost from overall progress
  const totalLessons = (currentUser.completedLessons||[]).length;
  score = Math.min(100, score + totalLessons * 1.5);
  return Math.round(Math.min(100, score));
}

function updateEnIndicators(){
  const pct = calcEnglishLevel();
  currentUser.englishLevel = pct;
  const stage = getEnStage(pct);

  // Home
  const en = p => p && (p.textContent = stage.label);
  const ep = p => p && (p.textContent = pct + '%');
  const eb = p => p && (p.style.width = pct + '%');
  en(document.getElementById('en-stage-lbl'));
  ep(document.getElementById('en-pct-num'));
  eb(document.getElementById('en-bar'));
  // Progress
  en(document.getElementById('p-en-stage'));
  ep(document.getElementById('p-en-pct'));
  eb(document.getElementById('p-en-bar'));
  const next = pct<20?'Complète 2 leçons d\'anglais':pct<40?'Score 70%+ sur un quiz ELA':pct<60?'Lis 3 leçons en mode EN':'Continue ainsi!';
  const pel = document.getElementById('p-en-next');
  if(pel) pel.textContent = 'Prochaine étape: ' + next;
}

function getAutoLang(){
  const pct = calcEnglishLevel();
  const stage = getEnStage(pct);
  // If student explicitly set a lang, use it; else auto based on level
  return stage.mix > 0.5 ? 'en' : 'fr';
}

function getLessonQuizScore(lessonKey){
  // Return the best quiz score for a lesson key, or null
  const lesson = LESSONS[lessonKey];
  if(!lesson || !currentUser) return null;
  const qKey = lesson.quizKey;
  if(!qKey) return null;
  const history = (currentUser.quizHistory||[]).filter(q=>q.lesson===qKey);
  if(!history.length) return null;
  return Math.max(...history.map(q=>q.score));
}

function getSubjectAvgScore(subjectKey){
  if(!currentUser) return null;
  const s = SUBJECTS[subjectKey];
  if(!s) return null;
  const qKeys = s.chapters.map(c=>LESSONS[c.key]?.quizKey).filter(Boolean);
  const history = (currentUser.quizHistory||[]).filter(q=>qKeys.includes(q.lesson));
  if(!history.length) return null;
  return Math.round(history.reduce((a,b)=>a+b.score,0)/history.length);
}

function renderLessonInLang(){
  const lesson = LESSONS[currentLesson?.key];
  if(!lesson) return;
  const body = document.getElementById('lesson-body');
  const useLang = currentLang;
  const content = useLang==='en' && lesson.en ? lesson.en : lesson.fr;

  // ── Progress context bar ──────────────────────────────────
  const enPct = calcEnglishLevel();
  const stage = getEnStage(enPct);
  const prevScore = getLessonQuizScore(currentLesson?.key);
  const diff = currentUser?.difficulty||'normal';

  let progressBadge = '';
  if(prevScore !== null){
    const color = prevScore>=80?'#34d399':prevScore>=60?'#fbbf24':'#f87171';
    const label = prevScore>=80?'✅ Maîtrisé':'⚠️ À revoir';
    progressBadge = `<span style="background:${color}22;border:1px solid ${color}44;color:${color};border-radius:6px;padding:3px 8px;font-size:11px;font-weight:600">${label} — ${Math.round(prevScore)}%</span>`;
  }

  const diffBadge = diff==='easy'
    ? `<span style="background:rgba(52,211,153,.15);color:#34d399;border-radius:6px;padding:3px 8px;font-size:11px;border:1px solid rgba(52,211,153,.3)">🐢 Mode guidé</span>`
    : diff==='hard'
    ? `<span style="background:rgba(239,68,68,.12);color:#f87171;border-radius:6px;padding:3px 8px;font-size:11px;border:1px solid rgba(239,68,68,.25)">🔥 Mode avancé</span>`
    : '';

  const enBadge = `<span style="background:rgba(99,102,241,.12);color:#818cf8;border-radius:6px;padding:3px 8px;font-size:11px;border:1px solid rgba(99,102,241,.25)">${stage.label}</span>`;

  const contextBar = `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)">
    ${enBadge}${diffBadge}${progressBadge}
    ${prevScore===null?'<span style="color:var(--muted);font-size:11px;align-self:center">📝 Fais le quiz après pour suivre ta progression</span>':''}
  </div>`;

  // ── Adaptive hint injection (easy mode) ──────────────────
  let hintTip = '';
  if(diff==='easy'){
    hintTip = `<div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--muted)">
      💡 <strong style="color:#34d399">Mode guidé activé</strong> — Lis bien chaque section et note les formules importantes avant de faire le quiz.
    </div>`;
  }

  // ── EN level bilingual push (intermediate) ────────────────
  let bilingualTip = '';
  if(enPct>=20 && enPct<80 && lesson.en && useLang==='fr'){
    bilingualTip = `<div style="background:rgba(99,102,241,.07);border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px">
      🌍 <strong style="color:#818cf8">Astuce progrès</strong> — Tu es à <strong>${Math.round(enPct)}%</strong> anglais. 
      <button onclick="switchLang('en')" style="background:var(--accent);border:none;color:#fff;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:6px">Lire en Anglais →</button>
    </div>`;
  }

  // ── "Needs review" recap for scored < 60 ─────────────────
  let reviewTip = '';
  if(prevScore !== null && prevScore < 60){
    reviewTip = `<div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px">
      🔄 <strong style="color:#f87171">Leçon à revoir</strong> — Tu as eu <strong>${Math.round(prevScore)}%</strong> au dernier quiz. 
      Concentre-toi sur les sections en <strong style="color:#fbbf24">jaune</strong> et refais le quiz après.
    </div>`;
  } else if(prevScore !== null && prevScore >= 80){
    reviewTip = `<div style="background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.2);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px">
      🏆 <strong style="color:#34d399">Leçon maîtrisée!</strong> — Score: <strong>${Math.round(prevScore)}%</strong>. Tu peux approfondir avec ARIA ou passer à la leçon suivante.
      <button onclick="goTo('aria')" style="background:rgba(99,102,241,.2);border:none;color:#818cf8;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;margin-left:6px">Demander à ARIA →</button>
    </div>`;
  }

  body.innerHTML = contextBar + hintTip + reviewTip + bilingualTip + content;

  // Inject math problem generator for math lessons
  const mathKeys = ['l_math_logic','l_math_reels','l_math_func','l_math_trigo','l_math_vect','l_math_stats','l_math_us','l_math_eq'];
  if(mathKeys.includes(currentLesson?.key)) showMathGenerator(body, currentLesson.key);

  // Hide the old banner (replaced by inline context)
  const banner = document.getElementById('en-level-banner');
  if(banner) banner.style.display = 'none';
}

// ══════════════════════════════════════════
// HOME RENDER
// ══════════════════════════════════════════
function renderHome(){
  if(!currentUser) return;
  const u = currentUser;

  // Greeting
  const hr = new Date().getHours();
  const g = hr<12?'Bonjour':hr<17?'Bon après-midi':'Bonsoir';
  document.getElementById('home-name').textContent = `${g}, ${u.fname||u.name}! 👋`;
  document.getElementById('home-career').textContent = `Future ${(u.career||'Scientifique').split('/')[0].trim()} 🚀`;

  // Avatar
  const av = document.getElementById('home-av');
  if(u.photo){ av.innerHTML=`<img src="${u.photo}"/>`; }
  else { av.textContent = u.avatar||'👩🏾‍🔬'; }

  // XP
  const xpPerLevel = u.level * 100;
  document.getElementById('home-xp').textContent = u.xp;
  document.getElementById('home-level').textContent = `Nv.${u.level}`;
  document.getElementById('home-xpbar').style.width = Math.min(100, (u.xp%xpPerLevel)/xpPerLevel*100)+'%';
  document.getElementById('streak-num').textContent = u.streak;

  // English
  updateEnIndicators();

  // Quest
  renderQuest();

  // Subjects
  renderSubjectGrid();

  // Puzzle status
  const homePuzzleStatus = document.getElementById('home-puzzle-status');
  if (homePuzzleStatus) {
    const dayNum = _getDayNumber();
    const anyDone = Object.keys(SUBJECTS).some(k => _isPuzzleDoneToday(k, dayNum, 0));
    homePuzzleStatus.textContent = anyDone ? '✅ Puzzle du jour complété!' : 'Un nouveau défi t\'attend!';
  }

  updateOnline();
}

function renderQuest(){
  // Build smart quests based on actual progress
  const quests = buildSmartQuests();
  const done = currentUser.questsDone || [];
  const today = new Date().toDateString();
  if(currentUser.questDate !== today){
    currentUser.questsDone = [];
    currentUser.questDate = today;
    saveDB();
  }

  document.getElementById('quest-items').innerHTML = quests.map((q,i)=>{
    // Support pre-computed done state (e.g. puzzle done via localStorage)
    const isDone = done.includes(q.key) || !!q.done;
    const clickable = q.key === 'q_daily_puzzle' ? `goTo('puzzle')` : `toggleQ(${i},'${q.key}',${q.xp})`;
    return `<div class="quest-item">
      <div class="qcheck${isDone?' done':''}" id="qc${i}" onclick="${clickable}">${isDone?'✓':''}</div>
      <div class="qi-text${isDone?' text-muted':''}">${q.text}</div>
      <div class="qi-xp">+${q.xp}</div>
    </div>`;
  }).join('');
}

function buildSmartQuests(){
  if(!currentUser) return [];
  const quests = [];
  const enPct = calcEnglishLevel();
  const diff = currentUser.difficulty||'normal';
  const history = currentUser.quizHistory||[];
  const completed = currentUser.completedLessons||[];

  // 1. Find a weak subject to review (score < 60%)
  const weakSubject = Object.entries(SUBJECTS).find(([key])=>{
    const avg = getSubjectAvgScore(key);
    return avg !== null && avg < 60;
  });
  if(weakSubject){
    const [wKey, wSubj] = weakSubject;
    const avg = getSubjectAvgScore(wKey);
    quests.push({ text:`🔄 Révise ${wSubj.name} (moy. ${Math.round(avg)}%) — refais un quiz`, xp:30, key:`q_review_${wKey}` });
  }

  // 2. Find next unstarted lesson in the strongest subject
  const strongSubject = Object.entries(SUBJECTS).sort((a,b)=>{
    return (getSubjectAvgScore(b[0])||0)-(getSubjectAvgScore(a[0])||0);
  })[0];
  if(strongSubject){
    const [sKey, sSubj] = strongSubject;
    const nextCh = sSubj.chapters.find(ch=>!completed.includes(ch.id));
    if(nextCh) quests.push({ text:`🚀 Continue ${sSubj.name}: ${currentLang==='en'?nextCh.en:nextCh.title}`, xp:25, key:`q_next_${nextCh.id}` });
  }

  // 3. English level quest based on current stage
  if(enPct < 20){
    quests.push({ text:"🇺🇸 Fais ta 1ère leçon en mode Anglais", xp:20, key:'q_en_first' });
  } else if(enPct < 50){
    quests.push({ text:`🌍 Lis une leçon entière en Anglais (niveau ${Math.round(enPct)}%)`, xp:20, key:'q_en_practice' });
  } else {
    quests.push({ text:"🌟 Fais un quiz ELA (English Language Arts)", xp:35, key:'q_ela_quiz' });
  }

  // 4. Vocabulary session
  quests.push({ text:`🃏 Entraîne-toi: 10 flashcards vocabulaire STEM`, xp:15, key:'q_vocab_session' });

  // 5. Daily puzzle quest
  const dayNum = _getDayNumber();
  const puzzleDone = Object.keys(SUBJECTS).some(k => _isPuzzleDoneToday(k, dayNum, 0));
  quests.push({ text:`🧩 Résous le puzzle du jour`, xp:30, key:'q_daily_puzzle', done: puzzleDone });

  // 6. Difficulty-adaptive challenge
  if(diff==='hard'){
    quests.push({ text:"🔥 Mode Avancé: Score 90%+ sur un quiz aujourd'hui", xp:50, key:'q_challenge_hard' });
  } else if(diff==='easy'){
    quests.push({ text:"💪 Objectif: Dépasse 60% sur un quiz aujourd'hui", xp:25, key:'q_challenge_easy' });
  } else {
    quests.push({ text:"⭐ Objectif: Score 80%+ sur un quiz aujourd'hui", xp:35, key:'q_challenge_normal' });
  }

  return quests.slice(0,5);
}

function toggleQ(i, key, xp){
  const done = currentUser.questsDone||[];
  if(done.includes(key)) return;
  currentUser.questsDone = [...done, key];
  addXP(xp);
  renderQuest();
  showToast(`+${xp} XP! ⚡`,'');
}

function renderSubjectGrid(){
  const grid = document.getElementById('subject-grid');
  if(!grid) return;
  grid.innerHTML = Object.entries(SUBJECTS).map(([key,s])=>{
    const chapters = s.chapters.length;
    const done = (currentUser.completedLessons||[]).filter(l=>s.chapters.some(c=>c.id===l)).length;
    const pct = Math.round(done/chapters*100);
    const avgScore = getSubjectAvgScore(key);
    // Performance overlay
    let perfDot = '';
    if(avgScore !== null){
      const col = avgScore>=80?'#34d399':avgScore>=60?'#fbbf24':'#f87171';
      perfDot = `<div style="position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:${col};box-shadow:0 0 6px ${col}"></div>`;
    }
    const progLabel = avgScore !== null
      ? `${Math.round(avgScore)}% moy.`
      : pct>0 ? `${pct}% fait` : 'Commencer';
    return `<div class="subject-card ${s.cls}" onclick="openSubject('${key}')" style="position:relative">
      ${perfDot}
      ${s.isNew ? '<div class="sc-new">NEW</div>' : ''}
      <div class="sc-badge">${s.badge}</div>
      <div class="sc-icon">${s.icon}</div>
      <div class="sc-name">${currentLang==='en'?s.nameEn:s.name}</div>
      <div class="sc-prog">${progLabel}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════
// SUBJECTS & LESSONS
// ══════════════════════════════════════════
function openSubject(key){
  currentSubject = key;
  const s = SUBJECTS[key];
  document.getElementById('subj-hdr').textContent = currentLang==='en' ? s.nameEn : s.name;
  document.getElementById('subj-tag').textContent = s.badge;

  const container = document.getElementById('subj-chapters');
  container.innerHTML = `
    <div class="card" style="background:linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.01));margin-bottom:4px">
      <div style="font-size:36px;margin-bottom:8px">${s.icon}</div>
      <div class="fw-700" style="font-size:18px;font-family:'Playfair Display',serif">${currentLang==='en'?s.nameEn:s.name}</div>
      ${s.ref?`<div class="tag tag-amber" style="margin-top:8px">📚 ${s.ref}</div>`:''}
    </div>
    <div class="section-title">Chapitres</div>
    ${s.chapters.map(ch=>{
      const done = (currentUser.completedLessons||[]).includes(ch.id);
      const score = getLessonQuizScore(ch.key);
      const scoreTag = score!==null
        ? `<div class="tag text-xs" style="background:${score>=80?'rgba(52,211,153,.15)':score>=60?'rgba(251,191,36,.15)':'rgba(239,68,68,.15)'};color:${score>=80?'#34d399':score>=60?'#fbbf24':'#f87171'};border:1px solid currentColor">${score>=80?'⭐':score>=60?'✓':'↺'} ${Math.round(score)}%</div>`
        : done ? '<div class="tag tag-jade text-xs">✓ Lu</div>' : '';
      const needsReview = score !== null && score < 60;
      return `<div class="card2 aup" style="display:flex;align-items:center;gap:14px;cursor:pointer;margin-bottom:8px;${needsReview?'border-color:rgba(239,68,68,.3)':''}" onclick="openLesson('${ch.key}','${ch.id}')">
        <div style="flex:1">
          <div class="fw-600" style="font-size:14px">${currentLang==='en'?ch.en:ch.title}</div>
          <div class="text-xs text-muted">${currentLang==='en'?ch.title:ch.en}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          ${scoreTag}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>`;
    }).join('')}
    <div class="spacer"></div>`;
  goTo('subjects');
}

function openLesson(key, chId){
  const lesson = LESSONS[key];
  if(!lesson){ showToast('Leçon bientôt disponible! 🚀','warn'); return; }
  currentLesson = { key, chId };
  // Auto-detect language based on EN level
  currentLang = getAutoLang();
  document.getElementById('lsb-fr').classList.toggle('active', currentLang==='fr');
  document.getElementById('lsb-en').classList.toggle('active', currentLang==='en');
  document.getElementById('lesson-title').textContent = currentLang==='en' ? lesson.titleEn : lesson.title;
  // Tags
  document.getElementById('lesson-tags').innerHTML = (lesson.tags||[]).map(t=>`<div class="tag tag-${t.includes('US')||t.includes('🇺🇸')?'blue':t.includes('Priorité')?'rose':'amber'}">${t}</div>`).join('');
  renderLessonInLang();
  // Mark completed
  if(!(currentUser.completedLessons||[]).includes(chId)){
    currentUser.completedLessons = [...(currentUser.completedLessons||[]), chId];
    addXP(25);
    if(!currentUser.badges.includes('first')) unlockBadge('first');
    saveDB();
    // Celebrate lesson completion with emoji
    setTimeout(() => showEmojiReaction('complete'), 400);
  }
  goTo('lesson');
}

function switchLang(lang){
  currentLang = lang;
  document.getElementById('lsb-fr').classList.toggle('active', lang==='fr');
  document.getElementById('lsb-en').classList.toggle('active', lang==='en');
  renderLessonInLang();
}

// ══════════════════════════════════════════
// QUIZ ENGINE
// ══════════════════════════════════════════
let QS = { questions:[], current:0, answers:[], answered:false };

function startQuiz(){
  const lesson = LESSONS[currentLesson?.key];
  if(!lesson) return;
  const quiz = QUIZZES[lesson.quizKey];
  if(!quiz){ showToast('Quiz bientôt disponible!','warn'); return; }

  // Shuffle questions — if same quiz as last time, re-shuffle until order differs
  let qs = shuffleArray(quiz.questions);
  if(lesson.quizKey === _lastQuizKey && quiz.questions.length > 1) {
    // Ensure at least the first question is different
    let attempts = 0;
    while(qs[0] === quiz.questions[0] && attempts < 8) {
      qs = shuffleArray(quiz.questions);
      attempts++;
    }
  }
  _lastQuizKey = lesson.quizKey;

  if(currentUser.difficulty==='easy') qs = qs.slice(0,3);
  else if(currentUser.difficulty==='hard') qs = [...qs,...qs.slice(0,2)].slice(0,7);
  QS = { questions:qs, current:0, answers:[], answered:false, quizKey:lesson.quizKey };
  document.getElementById('quiz-hdr').textContent = quiz.title;
  document.getElementById('qtot').textContent = qs.length;
  renderQ();
  goTo('quiz');
}

function renderQ(){
  const q = QS.questions[QS.current];
  if(!q) return;
  const idx = QS.current, tot = QS.questions.length;
  document.getElementById('q-label').textContent = `Question ${idx+1} sur ${tot}`;
  document.getElementById('qnum').textContent = idx+1;
  document.getElementById('qprog').style.width = ((idx+1)/tot*100)+'%';
  document.getElementById('q-text').textContent = q.text;
  const ctx = document.getElementById('q-ctx');
  if(q.ctx){ ctx.textContent = q.ctx; ctx.style.display='block'; } else ctx.style.display='none';
  document.getElementById('choices').innerHTML = q.choices.map((c,ci)=>`
    <button class="choice" onclick="answerQ(${ci})">
      <div class="choice-letter">${'ABCD'[ci]}</div>${c}
    </button>`).join('');
  document.getElementById('explain').className='explain-box';
  document.getElementById('explain').style.display='none';
  document.getElementById('next-btn').style.display='none';
  QS.answered=false;

  // Easy mode: show a hint prompt automatically
  if((currentUser?.difficulty||'normal')==='easy'){
    const hintBar = document.createElement('div');
    hintBar.style.cssText='margin-top:10px;padding:8px 12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:8px;font-size:12px;color:#fbbf24;display:flex;align-items:center;gap:8px';
    hintBar.innerHTML = `💡 Mode guidé — Prends ton temps, relis la leçon si besoin.`;
    document.getElementById('choices').after(hintBar);
  }
}

function answerQ(ci){
  if(QS.answered) return;
  QS.answered=true;
  const q = QS.questions[QS.current];
  const ok = ci===q.correct;
  QS.answers.push({ci, correct:q.correct, ok});
  document.querySelectorAll('.choice').forEach((b,i)=>{
    if(i===q.correct) b.classList.add('ok');
    else if(i===ci&&!ok) b.classList.add('bad');
  });
  const ex = document.getElementById('explain');
  ex.textContent = ok ? q.ok : q.bad;
  ex.className = `explain-box show ${ok?'good':'bad2'}`;
  ex.style.display='block';
  const last = QS.current >= QS.questions.length-1;
  const nb = document.getElementById('next-btn');
  nb.textContent = last?'🏆 Voir les Résultats':'Question Suivante →';
  nb.style.display='flex';
  if(ok) addXP(10);

  // Show motivational emoji reaction
  showEmojiReaction(ok ? 'correct' : 'wrong');
}

function nextQ(){
  QS.current++;
  if(QS.current>=QS.questions.length) showResults();
  else renderQ();
}

function showResults(){
  const correct = QS.answers.filter(a=>a.ok).length;
  const total = QS.answers.length;
  const pct = Math.round(correct/total*100);
  document.getElementById('res-score').textContent = pct+'%';
  document.getElementById('res-label').textContent = `${correct}/${total} correctes`;
  document.getElementById('res-stars').textContent = pct>=80?'⭐⭐⭐':pct>=60?'⭐⭐':'⭐';

  // Conic ring
  const ring = document.getElementById('score-ring');
  ring.style.setProperty('background', `conic-gradient(${pct>=80?'var(--mint)':pct>=60?'var(--amber)':'var(--coral)'} ${pct*3.6}deg, var(--border) 0deg)`);

  // AI adaptation
  let ada='';
  const prevDiff = currentUser.difficulty||'normal';
  if(pct>=80){
    currentUser.difficulty='hard';
    ada=`🚀 Excellent! ${pct}% — Tu maîtrises ce sujet! Difficulté augmentée pour te pousser plus loin.\n🇺🇸 Next level: try this lesson in English mode!`;
  } else if(pct>=60){
    currentUser.difficulty='normal';
    ada=`👍 Bon travail! ${pct}% — Niveau maintenu. Révise les questions ratées.\nPratique les mots clés en anglais pour préparer ton école US.`;
  } else {
    currentUser.difficulty='easy';
    ada=`💪 ${pct}% — Ne te décourage pas! Quiz adapté en mode facile pour la prochaine fois.\nRéesaie après avoir relu la leçon – tu peux y arriver!`;
  }
  document.getElementById('ada-text').textContent = ada;

  // English level check – did EN level unlock?
  const oldEN = currentUser.englishLevel||0;
  const newEN = calcEnglishLevel();
  if(Math.floor(newEN/20) > Math.floor(oldEN/20)){
    const stage = getEnStage(newEN);
    const msg = document.getElementById('en-unlock-msg');
    msg.style.display='block';
    msg.innerHTML=`<div class="card" style="text-align:center;border-color:rgba(61,142,245,.4)"><div style="font-size:28px">🎉</div><div class="fw-700 text-blue" style="margin-top:6px">Nouveau niveau EN!</div><div class="text-sm text-muted">${stage.label} – ${stage.desc}</div></div>`;
  }
  currentUser.englishLevel = newEN;

  // Save quiz history
  const _newQuizEntry = {
    date:new Date().toISOString(), lesson:QS.quizKey, score:pct, correct, total,
    subject: currentSubject
  };
  currentUser.quizHistory = [...(currentUser.quizHistory||[]), _newQuizEntry];
  // Record on server (fire-and-forget)
  _apiCall('POST', '/progress/quiz', {
    lesson: QS.quizKey, subject: currentSubject, score: pct, correct, total
  }).catch(() => {});
  addXP(correct*15);

  // Subject badge
  if(pct>=70){
    if(currentSubject==='math') unlockBadge('math');
    if(currentSubject==='phys'||currentSubject==='chem'||currentSubject==='sci') unlockBadge('science');
    if(currentSubject==='ela'||currentSubject==='eng') unlockBadge('english');
    if(pct===100) unlockBadge('perfect');
  }
  saveDB();

  // Breakdown
  document.getElementById('res-breakdown').innerHTML = QS.answers.map((a,i)=>{
    const q = QS.questions[i];
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:18px">${a.ok?'✅':'❌'}</div>
      <div style="flex:1;font-size:12px;color:var(--muted)">${q.text.substring(0,65)}...</div>
      <div style="font-size:11px;color:${a.ok?'var(--mint)':'var(--coral)'}">${a.ok?'+10 XP':''}</div>
    </div>`;
  }).join('');

  // Recommend next lesson based on progress
  const nextLesson = getRecommendedNext();
  const recEl = document.getElementById('res-recommend');
  if(recEl && nextLesson){
    recEl.style.display='block';
    recEl.innerHTML=`<div style="margin-top:16px;padding:12px 14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);border-radius:12px">
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">📚 Recommandé pour toi</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:8px">${nextLesson.title}</div>
      <button onclick="openLesson('${nextLesson.key}','${nextLesson.chId}')" style="background:var(--accent);border:none;color:#fff;border-radius:8px;padding:8px 16px;font-size:13px;cursor:pointer;width:100%">Commencer →</button>
    </div>`;
  }

  // Email report
  if(navigator.onLine && document.getElementById('tog-email')?.classList.contains('on')){
    setTimeout(()=>{
      document.getElementById('res-email').style.display='block';
      document.getElementById('res-email-to').textContent = currentUser.parentEmail||'parent@email.com';
    }, 1500);
  }

  // Completion emoji celebration
  setTimeout(() => showEmojiReaction('complete'), 300);

  goTo('results');
}

function retake(){ if(currentLesson) startQuiz(); else goTo('home'); }

// ══════════════════════════════════════════
// PROGRESS RENDER
// ══════════════════════════════════════════
function renderProgress(){
  if(!currentUser) return;
  const u = currentUser;
  document.getElementById('st-xp').textContent = u.xp||0;
  document.getElementById('st-streak').textContent = u.streak||0;
  document.getElementById('st-lessons').textContent = (u.completedLessons||[]).length;
  document.getElementById('st-quizzes').textContent = (u.quizHistory||[]).length;
  updateEnIndicators();

  // Subject bars — color by quiz score, not just completion
  const bars = document.getElementById('subj-bars');
  bars.innerHTML = Object.entries(SUBJECTS).slice(0,8).map(([key,s])=>{
    const done = (u.completedLessons||[]).filter(l=>s.chapters.some(c=>c.id===l)).length;
    const pct = Math.round(done/s.chapters.length*100);
    const avgScore = getSubjectAvgScore(key);
    const hasScore = avgScore !== null;
    const displayPct = hasScore ? avgScore : pct;
    const color = hasScore
      ? (avgScore>=80?'var(--mint)':avgScore>=60?'var(--amber)':'var(--coral)')
      : 'var(--accent)';
    const label = hasScore ? `${pct}% lu · quiz ${Math.round(avgScore)}%` : `${pct}% lu`;
    return `<div style="margin-bottom:12px">
      <div class="flex-between" style="margin-bottom:5px">
        <div class="text-sm fw-600">${s.icon} ${s.name}</div>
        <div class="text-xs text-muted">${label}</div>
      </div>
      <div class="bar-track" style="height:7px"><div class="bar-fill" style="width:${displayPct}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  // Weak areas
  renderWeakAreas();

  // Recommended next
  const nextLesson = getRecommendedNext();
  const recEl = document.getElementById('progress-recommend');
  if(recEl){
    if(nextLesson){
      recEl.style.display='block';
      recEl.innerHTML=`<div class="section-title" style="margin-top:16px">📚 Recommandé pour toi</div>
        <div onclick="openLesson('${nextLesson.key}','${nextLesson.chId}')" style="padding:12px 14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;cursor:pointer;display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">▶️</div>
          <div>
            <div style="font-weight:600;font-size:14px">${nextLesson.title}</div>
            <div style="font-size:11px;color:var(--muted)">Basé sur tes résultats</div>
          </div>
        </div>`;
    } else {
      recEl.style.display='none';
    }
  }

  // Badges
  const ALL_BADGES = [
    {id:'first',icon:'🌟',name:'1ère Leçon'},{id:'streak3',icon:'🔥',name:'3 Jours'},
    {id:'perfect',icon:'💯',name:'Score 100%'},{id:'math',icon:'🧮',name:'Math Pro'},
    {id:'science',icon:'🔬',name:'Scientifique'},{id:'english',icon:'📚',name:'Bilingue'},
    {id:'experiment',icon:'🧪',name:'Expérience'},{id:'streak7',icon:'⭐',name:'7 Jours!'},
    {id:'usa_ready',icon:'🇺🇸',name:'USA Ready'},{id:'college',icon:'🎓',name:'Collège Prêt'},
  ];
  document.getElementById('badge-grid').innerHTML = ALL_BADGES.map(b=>
    `<div class="badge-tile${(u.badges||[]).includes(b.id)?' earned':''}">
      <div class="bt-icon">${b.icon}</div><div class="bt-name">${b.name}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════
// SETTINGS RENDER
// ══════════════════════════════════════════
function renderSettings(){
  if(!currentUser) return;
  const u = currentUser;
  const av = document.getElementById('settings-av');
  if(u.photo) av.innerHTML=`<img src="${u.photo}" style="width:100%;height:100%;object-fit:cover"/>`;
  else av.textContent = u.avatar||'👩🏾‍🔬';
  document.getElementById('s-name').textContent = u.name;
  document.getElementById('s-career').textContent = u.career||'STEM';
  document.getElementById('s-level').textContent = `Niveau ${u.level||1} · ${u.xp||0} XP`;
  document.getElementById('s-code').textContent = `Code: ${u.code||'---'}`;
  document.getElementById('s-email').textContent = u.parentEmail||'parent@email.com';
  document.getElementById('s-time').textContent = `Tous les jours à ${u.reminderTime||'18:00'}`;
  document.getElementById('s-difficulty').textContent = {'easy':'Facile','normal':'Normal','hard':'Difficile'}[u.difficulty||'normal']||'Auto';
}

// ══════════════════════════════════════════
// PARENT / TUTOR DASHBOARD
// ══════════════════════════════════════════
let selectedStudent = null;

function goParentDash(){
  const u = currentUser;
  document.getElementById('parent-role-label').textContent = u.role==='tutor' ? 'Tuteur · Vue élèves' : 'Parent · Vue famille';
  document.getElementById('p-dash-role').textContent = u.role==='tutor' ? '👩‍🏫 Tuteur' : '👨‍👩‍👧 Parent';
  document.getElementById('p-dash-name').textContent = `Bonjour, ${u.fname||u.name}!`;
  document.getElementById('p-dash-sub').textContent = u.role==='tutor'?'Suivez vos élèves':'Suivez les progrès de votre enfant';

  const av = document.getElementById('parent-av');
  if(u.photo) av.innerHTML=`<img src="${u.photo}" style="width:100%;height:100%;object-fit:cover"/>`;
  else av.textContent = u.avatar||'👨‍👩‍👧';

  renderStudentSelector();
  showScreen('parent');
}

function renderStudentSelector(){
  const linked = (currentUser.linkedStudents||[]);
  const students = linked.map(codeOrId =>
    DB.users.find(u=>u.code===codeOrId||u.id===codeOrId)
  ).filter(Boolean);

  const sel = document.getElementById('student-selector');
  if(students.length===0){
    sel.innerHTML='<div class="text-xs text-muted" style="padding:8px 0">Aucun élève lié – entrez un code ci-dessous</div>';
    document.getElementById('student-report-area').style.display='none';
    return;
  }

  sel.innerHTML = students.map(s=>
    `<div class="student-chip${selectedStudent?.id===s.id?' active':''}" onclick="selectStudent('${s.id}')">
      <div class="chip-av">${s.avatar||'👩🏾‍🔬'}</div>${s.fname||s.name}
    </div>`).join('');

  if(!selectedStudent && students.length>0) selectStudent(students[0].id);
}

function selectStudent(id){
  selectedStudent = DB.users.find(u=>u.id===id);
  if(!selectedStudent) return;
  renderStudentReport();
  document.querySelectorAll('.student-chip').forEach(c=>{
    c.classList.toggle('active', c.onclick.toString().includes(id));
  });
}

function renderStudentReport(){
  const s = selectedStudent;
  if(!s){ document.getElementById('student-report-area').style.display='none'; return; }
  document.getElementById('student-report-area').style.display='block';
  document.getElementById('report-student-name').textContent = s.fname||s.name;
  document.getElementById('report-date').textContent = new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});

  // Stats
  const todayH = (s.quizHistory||[]).filter(q=>new Date(q.date).toDateString()===new Date().toDateString());
  const xpToday = todayH.reduce((acc,q)=>acc+q.correct*15,0)+(s.questsDone?.length||0)*20;
  const avgToday = todayH.length>0?Math.round(todayH.reduce((acc,q)=>acc+q.score,0)/todayH.length):null;
  document.getElementById('r-xp').textContent = xpToday||s.xp||0;
  document.getElementById('r-streak').textContent = s.streak||0;
  document.getElementById('r-avg').textContent = avgToday!==null ? avgToday+'%' : (s.quizHistory?.length>0 ? Math.round(s.quizHistory.reduce((a,q)=>a+q.score,0)/s.quizHistory.length)+'%' : '--');

  // Activity feed
  const activities = [];
  (s.completedLessons||[]).slice(-3).forEach(id=>{
    for(const [sk,subj] of Object.entries(SUBJECTS)){
      const ch = subj.chapters.find(c=>c.id===id);
      if(ch){ activities.push({type:'lesson',icon:'📖',text:`Leçon: ${ch.title}`,sub:`${subj.name}`}); break; }
    }
  });
  (s.quizHistory||[]).slice(-3).forEach(q=>{
    activities.push({type:'quiz',icon:'✏️',text:`Quiz: ${q.lesson}`,sub:`Score: ${q.score}%`});
  });
  (s.badges||[]).slice(-2).forEach(b=>{
    activities.push({type:'badge',icon:'🏅',text:`Badge débloqué: ${b}`,sub:'Félicitations!'});
  });
  if(activities.length===0) activities.push({type:'missed',icon:'📵',text:'Aucune activité aujourd\'hui',sub:'Envoyez un rappel!'});

  document.getElementById('activity-feed').innerHTML = activities.slice(0,5).map(a=>
    `<div class="activity-item">
      <div class="ai-icon ${a.type}">${a.icon}</div>
      <div><div class="ai-text">${a.text}</div><div class="ai-time">${a.sub}</div></div>
    </div>`).join('');

  // Subject performance
  document.getElementById('subj-perf-list').innerHTML = Object.entries(SUBJECTS).slice(0,6).map(([key,subj])=>{
    const quizzes = (s.quizHistory||[]).filter(q=>q.subject===key);
    const avg = quizzes.length>0?Math.round(quizzes.reduce((a,q)=>a+q.score,0)/quizzes.length):null;
    const done = (s.completedLessons||[]).filter(l=>subj.chapters.some(c=>c.id===l)).length;
    const pct = Math.round(done/subj.chapters.length*100);
    const color = avg===null?'var(--muted)':avg>=80?'var(--mint)':avg>=60?'var(--amber)':'var(--coral)';
    const trend = avg===null?'':'→';
    return `<div class="sp-row">
      <div class="sp-header">
        <div class="sp-name">${subj.icon} ${subj.name}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="sp-pct" style="color:${color}">${avg!==null?avg+'%':'--'}</div>
          <div class="sp-trend">${trend}</div>
        </div>
      </div>
      <div class="bar-track" style="height:6px"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }).join('');

  // English level
  const enPct = s.englishLevel||0;
  const enStage = getEnStage(enPct);
  document.getElementById('r-en-stage').textContent = enStage.label;
  document.getElementById('r-en-pct').textContent = enPct+'%';
  document.getElementById('r-en-bar').style.width = enPct+'%';
  document.getElementById('r-en-next').textContent = enPct<20?'A besoin de pratiquer l\'anglais':enPct<60?'Progression encourageante!':'Excellent niveau bilingue!';

  // Weak areas
  const weak = Object.entries(SUBJECTS).filter(([key])=>{
    const qs = (s.quizHistory||[]).filter(q=>q.subject===key);
    return qs.length>0 && qs.reduce((a,q)=>a+q.score,0)/qs.length < 65;
  });
  document.getElementById('weak-areas').innerHTML = weak.length===0
    ? '<div class="alert-card good"><div class="alert-icon">✅</div><div class="alert-text">Aucune zone de faiblesse critique détectée. Continue ainsi!</div></div>'
    : weak.map(([k,s2])=>`<div class="alert-card warn"><div class="alert-icon">⚠️</div><div class="alert-text"><strong>${s2.icon} ${s2.name}</strong> – Score moyen faible. Révision recommandée.</div></div>`).join('');

  // Alerts
  const alerts = [];
  if((s.streak||0)===0) alerts.push({type:'warn',icon:'🔥',text:`${s.fname||'L\'élève'} n'a pas étudié aujourd'hui. Envoyez un rappel!`});
  if((s.streak||0)>=7) alerts.push({type:'good',icon:'🌟',text:`Bravo! ${s.fname||'L\'élève'} a une série de ${s.streak} jours consécutifs!`});
  if(enPct<20) alerts.push({type:'warn',icon:'🇺🇸',text:`Niveau anglais faible (${enPct}%). Encouragez la pratique des leçons ELA.`});
  document.getElementById('parent-alerts').innerHTML = alerts.map(a=>
    `<div class="alert-card ${a.type}"><div class="alert-icon">${a.icon}</div><div class="alert-text">${a.text}</div></div>`).join('');
}

async function linkStudent(){
  const code = document.getElementById('link-code-in').value.trim().toUpperCase();
  if(!code) return;
  const linked = currentUser.linkedStudents||[];
  if(linked.includes(code)){ showToast('Cet élève est déjà lié!','warn'); return; }
  try {
    const res = await _apiCall('POST', '/users/link-student', { studentCode: code });
    const data = await res.json();
    if(!res.ok){ showToast(data.error==='Student code not found'?'Code élève non trouvé. Vérifie le code!':data.error||'Erreur','warn'); return; }
    currentUser.linkedStudents = [...linked, code];
    saveDB();
    document.getElementById('link-code-in').value='';
    showToast('✅ Élève lié(e) avec succès!');
    renderStudentSelector();
  } catch(e) {
    showToast('Erreur réseau — réessaie','warn');
  }
}

function emailReport(){
  if(!selectedStudent){ showToast('Sélectionne un élève d\'abord','warn'); return; }
  const s = selectedStudent;
  const quizzes = s.quizHistory||[];
  const avg = quizzes.length>0?Math.round(quizzes.reduce((a,q)=>a+q.score,0)/quizzes.length):0;
  const subj = `Rapport STEM Academy – ${s.name} – ${new Date().toLocaleDateString('fr-FR')}`;
  const body = `Bonjour,\n\nRapport de progrès de ${s.name} (${new Date().toLocaleDateString('fr-FR')}):\n\n🎓 RÉSUMÉ\n• Niveau: ${s.level||1} (${s.xp||0} XP)\n• Streak: ${s.streak||0} jours consécutifs\n• Leçons complètes: ${(s.completedLessons||[]).length}\n• Quiz complétés: ${quizzes.length}\n• Score moyen: ${avg}%\n• Niveau anglais: ${s.englishLevel||0}%\n\n📚 MATIÈRES ÉTUDIÉES\n${Object.entries(SUBJECTS).map(([k,sub])=>{const d=(s.completedLessons||[]).filter(l=>sub.chapters.some(c=>c.id===l)).length;return d>0?`• ${sub.name}: ${d}/${sub.chapters.length} chapitres`:null;}).filter(Boolean).join('\n')}\n\n🏅 BADGES: ${(s.badges||[]).join(', ')||'Aucun'}\n\n🇺🇸 TRANSITION ANGLAIS: ${s.englishLevel||0}% – ${getEnStage(s.englishLevel||0).label}\n\nCordialement,\nSTEM Academy`;
  window.open(`mailto:${s.parentEmail||currentUser.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`);
  showToast('📧 Email ouvert!');
}

// PDF report — full implementation below

// ══════════════════════════════════════════
// AI TUTOR
// ══════════════════════════════════════════
const chatMsgs = [];
let chatInitialized = false;

function initChat(){
  if(chatInitialized) return;
  chatInitialized = true;
  addMsg('bot', `Salut ${currentUser?.fname||''}! Je suis <strong>ARIA</strong>, ta tutrice IA bilingue 🌟<br/><br/>Je parle <strong>français et anglais</strong>. Je peux t'expliquer tes cours camerounais (L'Excellence Maths & PC), te préparer pour l'école américaine, et t'aider à progresser en anglais!<br/><br/><em>Hi! I'm ARIA. Ask me anything about your studies, US school prep, or STEM careers! 🚀</em>`);
}

async function sendChat(){
  const inp = document.getElementById('chat-in');
  const msg = inp.value.trim();
  if(!msg) return;
  inp.value=''; inp.style.height='auto';
  addMsg('user',msg);
  chatMsgs.push({role:'user',content:msg});
  const typId = addMsg('bot','...',true);

  try{
    const res = await _apiCall('POST', '/ai/chat', { messages: chatMsgs });
    if(!res.ok) throw new Error('api-error');
    const data = await res.json();
    const reply = data.content || "Désolée, reconnecte-toi à internet!";
    document.getElementById(typId)?.remove();
    chatMsgs.push({role:'assistant',content:reply});
    addMsg('bot',reply);
  } catch(e){
    document.getElementById(typId)?.remove();
    const fb = offlineFallback(msg);
    chatMsgs.push({role:'assistant',content:fb});
    addMsg('bot',fb);
  }
}

function offlineFallback(msg){
  const m = msg.toLowerCase();
  if(m.includes('newton')||m.includes('force')) return "Newton's Laws (mode hors ligne):\n1ère: ∑F=0 ↔ vitesse constante\n2ème: F=m×a\n3ème: Action-réaction égale et opposée\n\nExemple: Mangue (0.3kg): F=0.3×10=3N ⬇️";
  if(m.includes('équation')||m.includes('equation')) return "Équations du 1er degré:\nax+b=c → x=(c-b)/a\nEx: 3x+6=15 → 3x=9 → x=3 ✓\n\nRègle d'or inéquations: diviser par négatif = signe inversé!";
  if(m.includes('atom')||m.includes('chimie')) return "Atome = protons(+) + neutrons(0) + électrons(-)\nZ = numéro atomique = nb protons\nNaCl (sel) = liaison ionique: Na⁺ + Cl⁻\nH₂O (eau) = liaison covalente ✓";
  if(m.includes('usa')||m.includes('school')||m.includes('école')) return "USA 8th grade:\n• A=90-100%, B=80-89%, C=70-79%\n• GPA: A=4.0, B=3.0, C=2.0\n• Ton niveau 2nde C = avance sur les autres élèves!\n• Vocabulary: counselor, schedule, locker, homeroom";
  if(m.includes('stress')||m.includes('anxieux')||m.includes('triste')) return "C'est normal de se sentir stressée! Voici 3 conseils:\n1. Respire profondément (4s inspir, 4s expir)\n2. Garde contact avec ta famille au Cameroun\n3. Parle à ton counselor à l'école – c'est gratuit et confidentiel!\nTu n'es pas seule 💙";
  return "Mode hors ligne. Reconnecte-toi pour une réponse complète! En attendant, explore les leçons disponibles hors ligne. 📚";
}

function addMsg(role, text, typing=false){
  const list = document.getElementById('chat-msgs');
  const id = 'msg-'+ Date.now()+Math.random().toString(36).substr(2);
  const ts = new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const div = document.createElement('div');
  div.id=id; div.className=`msg ${role}`;
  if(typing) div.innerHTML=`<div class="bubble"><div class="typing"><div class="tdot"></div><div class="tdot"></div><div class="tdot"></div></div></div>`;
  else div.innerHTML=`<div class="bubble">${text.replace(/\n/g,'<br/>')}</div><div class="msg-ts">${role==='user'?'Toi':'ARIA'} · ${ts}</div>`;
  list.appendChild(div);
  list.scrollTop=list.scrollHeight;
  return id;
}

function quickQ(q){ document.getElementById('chat-in').value=q; sendChat(); }
function chatKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();} }
function autoH(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; }

// Initialize chat when screen opens
const origShowScreen = showScreen;
window.addEventListener('_chatInit',()=>{ if(currentScreen2==='aria') initChat(); });

// ══════════════════════════════════════════
// GAMIFICATION
// ══════════════════════════════════════════
function addXP(n){
  if(!currentUser) return;
  currentUser.xp = (currentUser.xp||0)+n;
  const xpPerLevel = (currentUser.level||1)*100;
  if(currentUser.xp >= xpPerLevel*(currentUser.level||1)){
    currentUser.level = (currentUser.level||1)+1;
    showToast(`🎉 Niveau ${currentUser.level}!`);
  }
  saveDB();
}

const BADGE_DEFS = {
  first:{icon:'🌟',name:'1ère Leçon'}, streak3:{icon:'🔥',name:'3 jours'},
  perfect:{icon:'💯',name:'100%'}, math:{icon:'🧮',name:'Math Pro'},
  science:{icon:'🔬',name:'Scientifique'}, english:{icon:'📚',name:'Bilingue'},
  experiment:{icon:'🧪',name:'Expérience'}, streak7:{icon:'⭐',name:'7 Jours'},
  usa_ready:{icon:'🇺🇸',name:'USA Ready'}, college:{icon:'🎓',name:'Collège Prêt'}
};

function unlockBadge(id){
  if(!currentUser||(currentUser.badges||[]).includes(id)) return;
  currentUser.badges = [...(currentUser.badges||[]),id];
  const b = BADGE_DEFS[id];
  if(b) showToast(`🏅 Badge: ${b.name}!`);
  saveDB();
}

// ══════════════════════════════════════════
// STREAK & REPORT
// ══════════════════════════════════════════
function updateStreak(){
  if(!currentUser) return;
  const today = new Date().toDateString();
  const lastStudyStr = currentUser.lastStudy ? new Date(currentUser.lastStudy).toDateString() : null;
  if(lastStudyStr === today) return;
  const yest = new Date(); yest.setDate(yest.getDate()-1);
  currentUser.streak = lastStudyStr === yest.toDateString() ? (currentUser.streak||0)+1 : 1;
  currentUser.lastStudy = new Date().toISOString();
  if(currentUser.streak>=3) unlockBadge('streak3');
  if(currentUser.streak>=7) unlockBadge('streak7');
  saveDB();
}

function sendReport(){
  if(!currentUser) return;
  if(!navigator.onLine){ showToast('Hors ligne – rapport en attente','warn'); return; }
  const u = currentUser;
  const quizzes = u.quizHistory||[];
  const avg = quizzes.length>0?Math.round(quizzes.reduce((a,q)=>a+q.score,0)/quizzes.length):0;
  const subj = `Rapport STEM Academy – ${u.name} – ${new Date().toLocaleDateString('fr-FR')}`;
  const body = `Bonjour,\n\nRapport de progrès de ${u.name}:\n📚 Leçons: ${(u.completedLessons||[]).length}\n✏️ Quiz: ${quizzes.length} (moy. ${avg}%)\n🔥 Streak: ${u.streak||0} jours\n⭐ XP: ${u.xp||0}\n🇺🇸 Anglais: ${u.englishLevel||0}%\n🏅 Badges: ${(u.badges||[]).join(', ')||'Aucun'}\n\nCordialement,\nSTEM Academy`;
  window.open(`mailto:${u.parentEmail}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`);
  showToast('📧 Rapport ouvert!');
}

// ══════════════════════════════════════════
// ONLINE / NOTIFICATIONS / TOAST
// ══════════════════════════════════════════
function updateOnline(){
  const on = navigator.onLine;
  document.querySelectorAll('#status-dot,#aria-status,#parent-status').forEach(d=>{
    if(d) d.className = on ? 'dot-online' : 'dot-offline';
  });
  document.querySelectorAll('#status-txt').forEach(t=>{ if(t) t.textContent = on?'En ligne':'Hors ligne'; });
}

window.addEventListener('online',()=>{ updateOnline(); showToast('📶 Connectée!'); });
window.addEventListener('offline',()=>{ updateOnline(); showToast('📵 Mode hors ligne','warn'); });
setInterval(updateOnline, 8000);

function scheduleNotifications(){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  if(!currentUser) return;
  const [h,m] = (currentUser.reminderTime||'18:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h,m,0,0);
  if(next<=now) next.setDate(next.getDate()+1);
  const msgs = [
    `📚 C'est l'heure d'étudier, ${currentUser.fname||''}! ARIA t'attend!`,
    `🔥 Ne perds pas ta série de ${currentUser.streak||1} jours!`,
    `🌟 Ton avenir aux USA commence par une leçon aujourd'hui!`,
    `🇺🇸 Prépare ton premier jour à l'école américaine!`
  ];
  setTimeout(()=>{
    new Notification('STEM Academy 🚀',{body:msgs[Math.floor(Math.random()*msgs.length)],icon:'icon-192.png'});
    scheduleNotifications();
  }, next-now);
}

let toastT;
function showToast(msg, type=''){
  const t = document.getElementById('toast');
  t.textContent=msg;
  t.className=`toast show ${type}`;
  clearTimeout(toastT);
  toastT=setTimeout(()=>t.classList.remove('show'),3200);
}

// ══════════════════════════════════════════
// SCREEN-SPECIFIC INIT HOOKS
// ══════════════════════════════════════════
// (goTo is already defined above with aria init hook built in)

function getQuestTimeLeft(){
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(24,0,0,0);
  const diff = midnight - now;
  const h = Math.floor(diff/3600000);
  const m = Math.floor((diff%3600000)/60000);
  return `${h}h ${m}m`;
}

// ══════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════

// ══════════════════════════════════════════
// VOCABULARY DATA (STEM Bilingual FR→EN)
// ══════════════════════════════════════════
const VOCAB = [
  {fr:"Accélération",en:"Acceleration",hint:"Variation de la vitesse / Change in velocity per unit time"},
  {fr:"Acide",en:"Acid",hint:"pH < 7 / pH less than 7"},
  {fr:"Algorithme",en:"Algorithm",hint:"Suite d'instructions / Ordered set of instructions"},
  {fr:"Allèle",en:"Allele",hint:"Version d'un gène / Variant form of a gene"},
  {fr:"Atome",en:"Atom",hint:"Plus petite particule d'un élément / Smallest unit of an element"},
  {fr:"Base (chimie)",en:"Base/Alkali",hint:"pH > 7 / pH greater than 7"},
  {fr:"Biome",en:"Biome",hint:"Zone écologique / Large ecological zone"},
  {fr:"Carbone",en:"Carbon",hint:"Élément C, base de la vie / Element C, basis of life"},
  {fr:"Cellule",en:"Cell",hint:"Unité de base du vivant / Basic unit of life"},
  {fr:"Chlorophylle",en:"Chlorophyll",hint:"Pigment vert des plantes / Green pigment in plants"},
  {fr:"Chromosome",en:"Chromosome",hint:"Structure portant l'ADN / Structure carrying DNA"},
  {fr:"Circuit",en:"Circuit",hint:"Boucle électrique / Electrical loop"},
  {fr:"Coefficient",en:"Coefficient",hint:"Nombre devant une variable / Number before a variable"},
  {fr:"Conservation",en:"Conservation",hint:"Préservation / Preservation of a quantity"},
  {fr:"Courant électrique",en:"Electric current",hint:"Flux de charges / Flow of electric charge (Amperes)"},
  {fr:"Densité",en:"Density",hint:"Masse/Volume / Mass per unit volume"},
  {fr:"Déplacement",en:"Displacement",hint:"Vecteur position initiale→finale / Vector from start to end position"},
  {fr:"Dissolution",en:"Dissolution",hint:"Solide qui se dissout / Solid dissolving in liquid"},
  {fr:"ADN",en:"DNA",hint:"Acide désoxyribonucléique / Deoxyribonucleic acid"},
  {fr:"Domaine (fonction)",en:"Domain",hint:"Ensemble des entrées / Set of all input values"},
  {fr:"Écosystème",en:"Ecosystem",hint:"Communauté + environnement / Community + its environment"},
  {fr:"Énergie cinétique",en:"Kinetic energy",hint:"Énergie du mouvement: ½mv² / Energy of motion"},
  {fr:"Énergie potentielle",en:"Potential energy",hint:"Énergie de position: mgh / Stored energy"},
  {fr:"Équation",en:"Equation",hint:"Égalité avec variable(s) / Mathematical statement of equality"},
  {fr:"Évolution",en:"Evolution",hint:"Changement des espèces / Change in species over time"},
  {fr:"Factoriser",en:"To factor",hint:"Écrire comme produit / Rewrite as a product"},
  {fr:"Force",en:"Force",hint:"Poussée ou traction: F=ma / Push or pull, measured in Newtons"},
  {fr:"Fréquence",en:"Frequency",hint:"Nombre d'oscillations/seconde / Oscillations per second (Hz)"},
  {fr:"Gène",en:"Gene",hint:"Séquence d'ADN / DNA sequence coding for a trait"},
  {fr:"Génotype",en:"Genotype",hint:"Constitution génétique / Genetic makeup (allele combination)"},
  {fr:"Gravité",en:"Gravity",hint:"Force d'attraction / Attractive force between masses"},
  {fr:"Homéostasie",en:"Homeostasis",hint:"Équilibre interne / Maintenance of stable internal conditions"},
  {fr:"Hypothèse",en:"Hypothesis",hint:"Supposition testable / Testable prediction"},
  {fr:"Inertie",en:"Inertia",hint:"Résistance au changement de mouvement / Resistance to change in motion"},
  {fr:"Ion",en:"Ion",hint:"Atome chargé / Charged atom"},
  {fr:"Isotope",en:"Isotope",hint:"Même élément, nb neutrons différent / Same element, different neutron count"},
  {fr:"Liaison chimique",en:"Chemical bond",hint:"Force entre atomes / Force holding atoms together"},
  {fr:"Lumière",en:"Light",hint:"Onde électromagnétique / Electromagnetic wave, c=3×10⁸ m/s"},
  {fr:"Manteau terrestre",en:"Earth's mantle",hint:"Couche entre croûte et noyau / Layer between crust and core"},
  {fr:"Masse",en:"Mass",hint:"Quantité de matière en kg / Amount of matter (kg)"},
  {fr:"Médiane",en:"Median",hint:"Valeur centrale / Middle value in a dataset"},
  {fr:"Membrane cellulaire",en:"Cell membrane",hint:"Enveloppe de la cellule / Outer boundary of a cell"},
  {fr:"Mitochondrie",en:"Mitochondria",hint:"'Powerhouse' de la cellule / Cell's energy producer"},
  {fr:"Molécule",en:"Molecule",hint:"Groupe d'atomes liés / Group of bonded atoms"},
  {fr:"Mouvement",en:"Motion",hint:"Changement de position / Change in position over time"},
  {fr:"Mutation",en:"Mutation",hint:"Changement dans l'ADN / Change in DNA sequence"},
  {fr:"Neutron",en:"Neutron",hint:"Particule neutre du noyau / Neutral particle in nucleus"},
  {fr:"Neutralisation",en:"Neutralization",hint:"Acide + Base → sel + eau / Acid + Base → salt + water"},
  {fr:"Noyau (cellule)",en:"Nucleus (cell)",hint:"Centre de contrôle de la cellule / Cell's control center"},
  {fr:"Noyau (atome)",en:"Nucleus (atom)",hint:"Protons + neutrons / Core of atom: protons + neutrons"},
  {fr:"Onde",en:"Wave",hint:"Perturbation se propageant / Disturbance propagating through space"},
  {fr:"Orbite",en:"Orbit",hint:"Trajectoire autour d'un astre / Path around a celestial body"},
  {fr:"Oxydation",en:"Oxidation",hint:"Perte d'électrons / Loss of electrons"},
  {fr:"Parabole",en:"Parabola",hint:"Courbe du 2nd degré / Curve of quadratic function"},
  {fr:"pH",en:"pH",hint:"Mesure acidité 0-14 / Measure of acidity/basicity"},
  {fr:"Phénotype",en:"Phenotype",hint:"Traits observables / Observable traits expressed"},
  {fr:"Photosynthèse",en:"Photosynthesis",hint:"Lumière+CO₂+H₂O→glucose / Light energy → chemical energy"},
  {fr:"Plaques tectoniques",en:"Tectonic plates",hint:"Plaques de la lithosphère / Rigid plates of Earth's crust"},
  {fr:"Poids",en:"Weight",hint:"Force gravitationnelle: P=mg / Gravitational force on mass"},
  {fr:"Pente",en:"Slope",hint:"Inclinaison d'une droite / Rate of change (rise/run)"},
  {fr:"Précipitation",en:"Precipitation",hint:"Pluie, neige, grêle / Rain, snow, hail falling from clouds"},
  {fr:"Probabilité",en:"Probability",hint:"Chance qu'un événement arrive / Likelihood of an event"},
  {fr:"Proton",en:"Proton",hint:"Particule positive du noyau / Positively charged nuclear particle"},
  {fr:"Puissance",en:"Power",hint:"Énergie par unité de temps: P=W/t / Energy per unit time (Watts)"},
  {fr:"Réactif",en:"Reactant",hint:"Substance de départ d'une réaction / Starting substance in reaction"},
  {fr:"Réflexion",en:"Reflection",hint:"Rebond de la lumière: i=r / Light bouncing off a surface"},
  {fr:"Réfraction",en:"Refraction",hint:"Déviation de la lumière / Bending of light changing media"},
  {fr:"Résistance",en:"Resistance",hint:"Opposition au courant: R=U/I (Ω) / Opposition to current flow"},
  {fr:"Respiration cellulaire",en:"Cellular respiration",hint:"Glucose+O₂→ATP+CO₂ / Process producing ATP energy"},
  {fr:"Sélection naturelle",en:"Natural selection",hint:"Survie des plus adaptés / Survival and reproduction of the fittest"},
  {fr:"Séisme",en:"Earthquake",hint:"Tremblement de terre / Shaking of Earth's crust"},
  {fr:"Solubilité",en:"Solubility",hint:"Capacité à se dissoudre / Ability to dissolve in a solvent"},
  {fr:"Statistiques",en:"Statistics",hint:"Science des données / Study of data collection and analysis"},
  {fr:"Tension",en:"Voltage",hint:"Différence de potentiel en Volts / Electric potential difference (V)"},
  {fr:"Théorie",en:"Theory",hint:"Explication testée et soutenue / Well-tested scientific explanation"},
  {fr:"Tissu (biologie)",en:"Tissue",hint:"Ensemble de cellules similaires / Group of similar cells"},
  {fr:"Travail (physique)",en:"Work (physics)",hint:"W=F×d×cos(θ) en Joules / Force × displacement × cos(θ)"},
  {fr:"Vecteur",en:"Vector",hint:"Grandeur avec direction et sens / Quantity with magnitude and direction"},
  {fr:"Vitesse",en:"Velocity/Speed",hint:"Vitesse=vecteur, rapidité=scalaire / Velocity=vector, speed=scalar"},
  {fr:"Variable",en:"Variable",hint:"Inconnue dans une équation / Unknown value in an equation"},
  {fr:"Variance",en:"Variance",hint:"Mesure de dispersion: σ²=Σ(xi-x̄)²/n / Measure of data spread"},
  {fr:"Volcan",en:"Volcano",hint:"Bouche éruptive / Opening where magma erupts"},
  {fr:"Déductible (assurance)",en:"Deductible",hint:"Franchise = ce que tu paies avant l'assurance / Amount you pay before insurance kicks in"},
  {fr:"Hypothèse nulle",en:"Null hypothesis",hint:"Pas d'effet supposé / Assumption of no effect"},
  {fr:"Pendule",en:"Pendulum",hint:"Masse oscillant / Swinging mass on a string"},
  {fr:"Inertie thermique",en:"Thermal inertia",hint:"Résistance au changement de T° / Resistance to temperature change"},
  {fr:"Gradient",en:"Gradient",hint:"Pente d'une courbe / Rate of change along a curve"},
  {fr:"Intégrale",en:"Integral",hint:"Aire sous la courbe / Area under a curve"},
  {fr:"Dérivée",en:"Derivative",hint:"Taux de variation / Rate of change at a point"},
  {fr:"Récession (économie)",en:"Recession",hint:"Ralentissement économique / Economic slowdown (2+ quarters)"},
  {fr:"Inflation",en:"Inflation",hint:"Hausse des prix / Rise in general price level"},
  {fr:"PIB",en:"GDP",hint:"Produit Intérieur Brut / Gross Domestic Product"},
  {fr:"Chromosome sexuel",en:"Sex chromosome",hint:"X ou Y déterminant le sexe / X or Y chromosome"},
  {fr:"Enzyme",en:"Enzyme",hint:"Protéine accélérant les réactions / Protein catalyst for reactions"},
  {fr:"Osmose",en:"Osmosis",hint:"Diffusion de l'eau à travers membrane / Water diffusion through membrane"},
  {fr:"Mitose",en:"Mitosis",hint:"Division cellulaire → 2 cellules identiques / Cell division → 2 identical cells"},
  {fr:"Méiose",en:"Meiosis",hint:"Division → 4 gamètes (moitié ADN) / Division → 4 sex cells"},
  {fr:"Tropisme",en:"Tropism",hint:"Croissance vers stimulus / Plant growth toward a stimulus"},
  {fr:"Symbiose",en:"Symbiosis",hint:"Relation mutualiste entre espèces / Mutual benefit relationship between species"},
  {fr:"Biodiversité",en:"Biodiversity",hint:"Variété du vivant / Variety of life in an ecosystem"},
  {fr:"Stratosphère",en:"Stratosphere",hint:"12-50 km, couche d'ozone / 12-50 km layer, contains ozone"},
  {fr:"Effet de serre",en:"Greenhouse effect",hint:"Piège de la chaleur atmosphérique / Trapping of heat by atmosphere"},
  {fr:"Lithosphère",en:"Lithosphere",hint:"Croûte + manteau supérieur = plaques / Earth's rigid outer shell"},
  {fr:"Subduction",en:"Subduction",hint:"Plaque plongeant sous une autre / One plate sliding under another"},
  {fr:"Déforestation",en:"Deforestation",hint:"Destruction des forêts / Clearing of forests"},
  {fr:"Fission nucléaire",en:"Nuclear fission",hint:"Noyau lourd → 2 noyaux + énergie / Heavy nucleus splits, releases energy"},
  {fr:"Onde sonore",en:"Sound wave",hint:"Vibration mécanique de l'air / Mechanical vibration through matter"},
  {fr:"Résonance",en:"Resonance",hint:"Vibration à fréquence naturelle / Vibration at natural frequency"},
  {fr:"Circuit série",en:"Series circuit",hint:"Composants en ligne, même courant / Components in a line, same current"},
  {fr:"Circuit parallèle",en:"Parallel circuit",hint:"Composants en branches, même tension / Branches, same voltage"},
];

// ══════════════════════════════════════════
// PLACEMENT TEST DATA
// ══════════════════════════════════════════
const PLACEMENT_Qs = [
  {q:"Résous: 3x + 6 = 15", choices:["x=1","x=2","x=3","x=5"], correct:2, sub:'math'},
  {q:"Quelle est la formule de la vitesse?", choices:["v=m×a","v=d/t","v=F/m","v=P/t"], correct:1, sub:'phys'},
  {q:"Choose the correct sentence:", choices:["She go to school","She goes to school","She going school","She is go school"], correct:1, sub:'eng'},
  {q:"Un atome est:", choices:["Une molécule","La plus petite particule d'un élément","Un proton seulement","Une cellule"], correct:1, sub:'sci'},
  {q:"What does 'photosynthesis' mean?", choices:["Light destroys plants","Plants make food from light","Animals eat plants","Light measures heat"], correct:1, sub:'eng'},
  {q:"f(x) = 2x² + 3. Quelle est f(2)?", choices:["10","11","14","8"], correct:1, sub:'math'},
  {q:"Le pH du sang humain est environ:", choices:["2","7.4","9","14"], correct:1, sub:'sci'},
  {q:"Which word means 'accélération'?", choices:["Velocity","Speed","Acceleration","Momentum"], correct:2, sub:'eng'},
  {q:"Simplifie: x² − 9", choices:["(x−3)²","(x−3)(x+3)","x(x−9)","(x+9)"], correct:1, sub:'math'},
  {q:"La mitochondrie produit:", choices:["L'ADN","L'ATP (énergie)","Le glucose","Les protéines"], correct:1, sub:'sci'},
  {q:"What is the main idea of a text?", choices:["The title","The central message","The first sentence","The author's name"], correct:1, sub:'eng'},
  {q:"Quelle loi dit F = m × a?", choices:["1ère loi de Newton","2ème loi de Newton","3ème loi de Newton","Loi d'Ohm"], correct:1, sub:'phys'},
  {q:"sin(90°) = ?", choices:["0","1","0.5","√2/2"], correct:1, sub:'math'},
  {q:"Which best describes a 'thesis statement'?", choices:["A question you ask","Your main argument + 3 reasons","A quote from the text","A definition"], correct:1, sub:'eng'},
  {q:"La plateforme de candidature universitaire aux USA s'appelle:", choices:["CollegeApp","Universal App","Common App","School App"], correct:2, sub:'us'},
];

// ══════════════════════════════════════════
// PLACEMENT TEST LOGIC
// ══════════════════════════════════════════
let placementAnswers = [];
let currentPlacementQ = 0;

function startPlacement() {
  placementAnswers = [];
  currentPlacementQ = 0;
  showScreen('placement');
  renderPlacementQ();
}

function renderPlacementQ() {
  const q = PLACEMENT_Qs[currentPlacementQ];
  const total = PLACEMENT_Qs.length;
  const body = document.getElementById('placement-body');
  const pct = Math.round((currentPlacementQ/total)*100);
  body.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:var(--muted);font-size:13px">Question ${currentPlacementQ+1}/${total}</span>
        <span style="color:var(--accent);font-size:13px;font-weight:600">${pct}%</span>
      </div>
      <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:4px">
        <div style="background:var(--accent);height:4px;border-radius:4px;width:${pct}%;transition:width 0.3s"></div>
      </div>
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px">
      <div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${{math:'📐 Mathématiques',phys:'⚡ Physique',sci:'🔬 Sciences',eng:'🇺🇸 Anglais',us:'🗽 USA'}[q.sub]||'Question'}</div>
      <p style="font-size:17px;font-weight:600;line-height:1.4">${q.q}</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${q.choices.map((c,i)=>`<button onclick="answerPlacement(${i})" style="background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:14px;text-align:left;cursor:pointer;font-size:15px;transition:all 0.2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">${c}</button>`).join('')}
    </div>`;
}

function answerPlacement(idx) {
  const q = PLACEMENT_Qs[currentPlacementQ];
  placementAnswers.push({sub:q.sub, correct: idx===q.correct});
  currentPlacementQ++;
  if(currentPlacementQ >= PLACEMENT_Qs.length) {
    finishPlacement();
  } else {
    renderPlacementQ();
  }
}

function finishPlacement() {
  const subs = {};
  placementAnswers.forEach(a => {
    if(!subs[a.sub]) subs[a.sub]={total:0,correct:0};
    subs[a.sub].total++;
    if(a.correct) subs[a.sub].correct++;
  });
  const mathPct = subs.math ? (subs.math.correct/subs.math.total) : 0.5;
  const engPct = subs.eng ? (subs.eng.correct/subs.eng.total) : 0.3;
  const sciPct = subs.sci ? (subs.sci.correct/subs.sci.total) : 0.5;
  
  // Set initial level based on results
  if(currentUser) {
    currentUser.mathLevel = Math.round(mathPct * 5);
    currentUser.engLevel = Math.round(engPct * 4);
    currentUser.placementDone = true;
    saveDB();
  }
  
  const body = document.getElementById('placement-body');
  const total = placementAnswers.filter(a=>a.correct).length;
  body.innerHTML = `
    <div style="text-align:center;padding:20px">
      <div style="font-size:56px;margin-bottom:12px">🎯</div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:8px">Test Terminé! ${total}/${PLACEMENT_Qs.length} correctes</h3>
      <p style="color:var(--muted);margin-bottom:20px">Ton parcours est maintenant personnalisé pour toi!</p>
      <div style="display:grid;gap:10px;text-align:left;margin-bottom:20px">
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px">
          <div style="color:var(--muted);font-size:12px;margin-bottom:4px">📐 Mathématiques</div>
          <div style="font-size:16px;font-weight:600">${Math.round(mathPct*100)}% — ${mathPct>0.7?'Niveau avancé ✨':mathPct>0.4?'Niveau intermédiaire 📈':'Niveau débutant 💪'}</div>
        </div>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px">
          <div style="color:var(--muted);font-size:12px;margin-bottom:4px">🇺🇸 Anglais</div>
          <div style="font-size:16px;font-weight:600">${Math.round(engPct*100)}% — ${engPct>0.7?'Bilingue ✨':engPct>0.4?'Intermédiaire 📈':'Débutante 💪'}</div>
        </div>
      </div>
      <button onclick="goTo('home')" style="background:var(--accent);border:none;color:#fff;border-radius:12px;padding:14px 32px;font-size:16px;font-weight:600;cursor:pointer;width:100%">🚀 Commencer les Cours!</button>
    </div>`;
}

// ══════════════════════════════════════════
// VOCABULARY / FLASHCARD SYSTEM
// ══════════════════════════════════════════
let vocabDeck = [...VOCAB];
let vocabIndex = 0;
let vocabFlipped = false;
let vocabCorrect = 0;
let vocabWrong = 0;

function shuffleVocab() {
  vocabDeck = [...VOCAB].sort(()=>Math.random()-0.5);
  vocabIndex = 0;
  vocabFlipped = false;
  vocabCorrect = 0;
  vocabWrong = 0;
  renderCard();
  showToast('Cartes mélangées! 🔀');
}

function renderCard() {
  const card = vocabDeck[vocabIndex];
  document.getElementById('vocab-counter').textContent = `Carte ${vocabIndex+1}/${vocabDeck.length}`;
  document.getElementById('vocab-score').textContent = `✓ ${vocabCorrect}  ✗ ${vocabWrong}`;
  document.getElementById('card-side-label').textContent = 'Français 🇫🇷';
  document.getElementById('card-text').textContent = card.fr;
  document.getElementById('card-hint').textContent = card.hint ? card.hint.split(' / ')[0] : '';
  document.getElementById('card-back').style.display = 'none';
  document.getElementById('vocab-buttons').style.display = 'none';
  vocabFlipped = false;
}

function flipCard() {
  if(vocabFlipped) return;
  vocabFlipped = true;
  const card = vocabDeck[vocabIndex];
  document.getElementById('card-side-label').textContent = '✓ Réponse anglaise';
  document.getElementById('card-en').textContent = card.en;
  document.getElementById('card-en-hint').textContent = card.hint ? card.hint.split(' / ')[1] || '' : '';
  document.getElementById('card-back').style.display = 'block';
  document.getElementById('vocab-buttons').style.display = 'flex';
}

function vocabAnswer(knew) {
  if(knew) vocabCorrect++; else vocabWrong++;
  nextCard();
}

function nextCard() {
  if(vocabIndex < vocabDeck.length - 1) {
    vocabIndex++;
    renderCard();
  } else {
    showToast(`🎉 Deck terminé! ${vocabCorrect}/${vocabDeck.length} correctes`);
  }
}

function prevCard() {
  if(vocabIndex > 0) { vocabIndex--; renderCard(); }
}

function speakWord() {
  const card = vocabDeck[vocabIndex];
  const utt = new SpeechSynthesisUtterance(card.en);
  utt.lang = 'en-US';
  utt.rate = 0.85;
  window.speechSynthesis.speak(utt);
}

function renderVocab() {
  renderCard();
}

// ══════════════════════════════════════════
// TTS — TEXT TO SPEECH IN LESSONS
// ══════════════════════════════════════════
let ttsActive = false;

function speakLesson(lang) {
  if(ttsActive) {
    window.speechSynthesis.cancel();
    ttsActive = false;
    showToast('🔇 Lecture arrêtée');
    return;
  }
  const container = document.getElementById('lesson-body');
  const text = container ? container.innerText.slice(0, 1500) : '';
  if(!text) return showToast('Pas de contenu à lire');
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang === 'en' ? 'en-US' : 'fr-FR';
  utt.rate = 0.9;
  utt.onend = () => { ttsActive = false; };
  window.speechSynthesis.speak(utt);
  ttsActive = true;
  showToast(`🔊 Lecture en ${lang==='en'?'anglais':'français'}...`);
}

// ══════════════════════════════════════════
// NOTES SYSTEM
// ══════════════════════════════════════════
let currentNotesKey = '';

function openNotes(lessonKey, lessonTitle) {
  currentNotesKey = 'notes_' + lessonKey;
  document.getElementById('notes-lesson-title').textContent = lessonTitle;
  const saved = localStorage.getItem(currentNotesKey) || '';
  document.getElementById('notes-textarea').value = saved;
  document.getElementById('notes-modal').style.display = 'flex';
}

function closeNotes() {
  document.getElementById('notes-modal').style.display = 'none';
}

function saveNotes() {
  const text = document.getElementById('notes-textarea').value;
  if(currentNotesKey) localStorage.setItem(currentNotesKey, text);
  closeNotes();
  showToast('📝 Notes sauvegardées!');
}

function clearNotes() {
  document.getElementById('notes-textarea').value = '';
  if(currentNotesKey) localStorage.removeItem(currentNotesKey);
  showToast('🗑️ Notes effacées');
}

// ══════════════════════════════════════════
// POMODORO TIMER
// ══════════════════════════════════════════
let pomSeconds = 25*60;
let pomInterval = null;
let pomRunning = false;
let pomSession = 1;
let pomBreak = false;

function togglePomodoro() {
  const panel = document.getElementById('pomodoro-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function startPomodoro() {
  if(pomRunning) {
    clearInterval(pomInterval);
    pomRunning = false;
    document.getElementById('pom-start').textContent = '▶ Start';
    return;
  }
  pomRunning = true;
  document.getElementById('pom-start').textContent = '⏸ Pause';
  pomInterval = setInterval(() => {
    pomSeconds--;
    if(pomSeconds <= 0) {
      clearInterval(pomInterval);
      pomRunning = false;
      document.getElementById('pom-start').textContent = '▶ Start';
      if(!pomBreak) {
        pomBreak = true;
        pomSeconds = 5*60;
        document.getElementById('pom-mode').textContent = '☕ Pause';
        document.getElementById('pom-session').textContent = `Session ${pomSession} terminée!`;
        showToast("⏱ Pause de 5 minutes! Tu l'as mérité!");
      } else {
        pomBreak = false;
        pomSession++;
        pomSeconds = 25*60;
        document.getElementById('pom-mode').textContent = '🍅 Étude';
        document.getElementById('pom-session').textContent = `Session ${pomSession}`;
        showToast("🍅 Session d'étude commencée!");
      }
    }
    const m = Math.floor(pomSeconds/60), s = pomSeconds%60;
    document.getElementById('pom-display').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
}

function resetPomodoro() {
  clearInterval(pomInterval);
  pomRunning = false;
  pomSeconds = 25*60;
  pomBreak = false;
  pomSession = 1;
  document.getElementById('pom-display').textContent = '25:00';
  document.getElementById('pom-mode').textContent = '🍅 Étude';
  document.getElementById('pom-start').textContent = '▶ Start';
  document.getElementById('pom-session').textContent = 'Session 1';
}

// ══════════════════════════════════════════
// MATH PROBLEM GENERATOR
// ══════════════════════════════════════════
function generateMathProblem(type) {
  const problems = {
    linear: () => {
      const a = Math.floor(Math.random()*8)+2;
      const b = Math.floor(Math.random()*10)+1;
      const c = a * (Math.floor(Math.random()*8)+1) + b;
      return {q:`Résous: ${a}x + ${b} = ${c}`, answer: `x = ${(c-b)/a}`, hint:`Soustrait ${b} des deux côtés, puis divise par ${a}`};
    },
    quadratic: () => {
      const r1 = Math.floor(Math.random()*6)+1;
      const r2 = Math.floor(Math.random()*6)+1;
      const b = -(r1+r2), c = r1*r2;
      return {q:`Factorise: x² ${b<0?b:'+'+b}x + ${c}`, answer:`(x−${r1})(x−${r2})`, hint:`Cherche deux nombres dont le produit est ${c} et la somme est ${-b}`};
    },
    stats: () => {
      const data = Array.from({length:5},()=>Math.floor(Math.random()*20)+1);
      const mean = (data.reduce((a,b)=>a+b)/data.length).toFixed(1);
      const sorted = [...data].sort((a,b)=>a-b);
      return {q:`Données: ${data.join(', ')}
Calcule la moyenne et la médiane.`, answer:`Moyenne: ${mean}, Médiane: ${sorted[2]}`, hint:`Somme÷n pour la moyenne, valeur centrale pour la médiane`};
    }
  };
  const gen = problems[type] || problems.linear;
  return gen();
}

function showMathGenerator(container, lessonKey) {
  const isMath = ['l_math_logic','l_math_reels','l_math_func','l_math_trigo','l_math_vect','l_math_stats','l_math_us','l_math_eq'].includes(lessonKey);
  if(!isMath || !container) return;
  
  const type = lessonKey.includes('stats') ? 'stats' : lessonKey.includes('func') ? 'linear' : lessonKey.includes('trigo') ? 'quadratic' : 'linear';
  
  let prob = generateMathProblem(type);
  const div = document.createElement('div');
  div.style.cssText = 'margin-top:24px;border-top:1px solid var(--border);padding-top:20px';
  div.innerHTML = `
    <h4 style="color:var(--accent);font-size:14px;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">🎲 Exercice Aléatoire</h4>
    <div id="math-q-box" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px;padding:16px;font-size:16px;font-weight:600;margin-bottom:12px;white-space:pre-line">${prob.q}</div>
    <div id="math-hint" style="color:var(--muted);font-size:13px;margin-bottom:8px;display:none">💡 ${prob.hint}</div>
    <div id="math-ans" style="color:var(--jade,#34d399);font-size:15px;font-weight:600;display:none">✅ ${prob.answer}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button onclick="document.getElementById('math-hint').style.display='block'" style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px">💡 Indice</button>
      <button onclick="document.getElementById('math-ans').style.display='block'" style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.3);color:#34d399;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px">✅ Réponse</button>
      <button onclick="(function(){const p=generateMathProblem('${type}');document.getElementById('math-q-box').textContent=p.q;document.getElementById('math-hint').textContent='💡 '+p.hint;document.getElementById('math-ans').textContent='✅ '+p.answer;document.getElementById('math-hint').style.display='none';document.getElementById('math-ans').style.display='none';})()" style="background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px">🎲 Nouveau</button>
    </div>`;
  container.appendChild(div);
}

// ══════════════════════════════════════════
// PDF / PRINT REPORT
// ══════════════════════════════════════════
function printReport() { // PDF print
  if(!currentUser) return;
  const subjects = getSubjects();
  const allLessons = subjects.flatMap(s => s.chapters.map(c=>c.key));
  const done = allLessons.filter(k => (currentUser.completed||[]).includes(k));
  const printContent = `
    <html><head><title>Rapport STEM Academy — ${currentUser.name}</title>
    <style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto} h1{color:#4f46e5} .bar{height:10px;background:#e5e7eb;border-radius:5px;margin:4px 0} .fill{height:10px;background:#4f46e5;border-radius:5px} table{width:100%;border-collapse:collapse;margin-top:20px} td,th{padding:8px;text-align:left;border-bottom:1px solid #e5e7eb} @media print{body{padding:20px}}</style></head>
    <body>
      <h1>📊 Rapport STEM Academy</h1>
      <p><strong>Élève:</strong> ${currentUser.name} | <strong>Code:</strong> ${currentUser.code}</p>
      <p><strong>Date:</strong> ${new Date().toLocaleDateString('fr-FR',{year:'numeric',month:'long',day:'numeric'})}</p>
      <h2>Progrès Global</h2>
      <p><strong>${done.length}/${allLessons.length}</strong> leçons complétées (${Math.round(done.length/allLessons.length*100)}%)</p>
      <div class="bar"><div class="fill" style="width:${Math.round(done.length/allLessons.length*100)}%"></div></div>
      <h2>Par Matière</h2>
      <table><tr><th>Matière</th><th>Complété</th><th>Total</th><th>%</th></tr>
      ${subjects.map(s=>{const chapKeys=s.chapters.map(c=>c.key);const n=chapKeys.filter(k=>(currentUser.completed||[]).includes(k)).length;const t=chapKeys.length;return `<tr><td>${s.icon} ${s.title}</td><td>${n}</td><td>${t}</td><td>${Math.round(n/t*100)}%</td></tr>`}).join('')}
      </table>
      <h2>Niveau Anglais</h2>
      <p>${Math.round(calcEnglishLevel())}% — ${getEnStage().label}</p>
      <p style="margin-top:30px;color:#666;font-size:12px">Généré par STEM Academy Cameroun → USA | contact: g1.feudjio@yahoo.com</p>
    </body></html>`;
  const win = window.open('','_blank');
  win.document.write(printContent);
  win.document.close();
  win.print();
}

// ══════════════════════════════════════════
// PUSH NOTIFICATIONS PERMISSION
// ══════════════════════════════════════════
function requestNotifPermission() {
  if('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(perm => {
      if(perm === 'granted') {
        showToast("🔔 Notifications activées! On te rappellera d'étudier 💪");
        scheduleNotifications();
      }
    });
  } else if(Notification.permission === 'granted') {
    scheduleNotifications();
  }
}

// ══════════════════════════════════════════
// MORE MENU
// ══════════════════════════════════════════
function toggleMoreMenu(){
  const mm = document.getElementById('more-menu');
  if(!mm) return;
  mm.style.display = mm.style.display==='none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  const mm = document.getElementById('more-menu');
  if(mm && mm.style.display==='block' && !mm.contains(e.target) && !e.target.closest('#nav-more')) {
    mm.style.display='none';
  }
});

// ══════════════════════════════════════════
// LEADERBOARD
// ══════════════════════════════════════════
function renderLeaderboard(){
  if(!currentUser) return;
  const db = loadDB2();
  // Gather all student users with scores
  const students = (db.users||[]).filter(u=>u.role==='student');
  // Build leaderboard entries
  const entries = students.map(u => {
    const subjects = getSubjects();
    const allKeys = subjects.flatMap(s=>s.chapters.map(c=>c.key));
    const done = (u.completed||[]).filter(k=>allKeys.includes(k)).length;
    const pct = allKeys.length ? Math.round(done/allKeys.length*100) : 0;
    const qh = u.quizHistory||[];
    const avgScore = qh.length ? Math.round(qh.reduce((s,q)=>s+(q.score||0),0)/qh.length) : 0;
    const score = (u.xp||0) + done*10 + avgScore*2;
    return { name: u.fname||u.name||'Élève', code: u.code||'???', xp: u.xp||0, done, pct, streak: u.streak||0, score, isMe: u.id===currentUser.id };
  }).sort((a,b)=>b.score-a.score);

  const myRank = entries.findIndex(e=>e.isMe)+1;
  const myEntry = entries.find(e=>e.isMe);
  const medals = ['🥇','🥈','🥉'];

  document.getElementById('leader-my-rank').innerHTML = myEntry ? `
    <div style="background:rgba(99,102,241,0.12);border:1px solid var(--accent);border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="font-size:28px;min-width:36px;text-align:center">${medals[myRank-1]||'#'+myRank}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:15px">Toi — ${myEntry.name}</div>
        <div style="color:var(--muted);font-size:12px">${myEntry.xp} XP · ${myEntry.done} leçons · ${myEntry.streak}🔥 jours</div>
      </div>
      <div style="text-align:right">
        <div style="color:var(--amber);font-weight:700;font-size:18px">${myEntry.pct}%</div>
        <div style="color:var(--muted);font-size:11px">complété</div>
      </div>
    </div>` : '';

  if(entries.length<=1){
    document.getElementById('leader-list').innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--muted)">
        <div style="font-size:48px;margin-bottom:12px">🏆</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Tu es la première!</div>
        <div style="font-size:13px">Invite d'autres élèves à rejoindre STEM Academy pour voir le classement.</div>
      </div>`;
    return;
  }

  document.getElementById('leader-list').innerHTML = `
    <div style="font-size:13px;color:var(--muted);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Top élèves</div>
    ${entries.slice(0,10).map((e,i)=>`
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:${e.isMe?'rgba(99,102,241,0.08)':'rgba(255,255,255,0.02)'};border:1px solid ${e.isMe?'var(--accent)':'var(--border)'};border-radius:12px;margin-bottom:8px">
      <div style="font-size:22px;min-width:32px;text-align:center">${medals[i]||i+1}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.isMe?'⭐ ':''} ${e.name} <span style="color:var(--muted);font-size:11px">${e.code}</span></div>
        <div style="color:var(--muted);font-size:12px">${e.xp} XP · ${e.streak}🔥</div>
      </div>
      <div style="text-align:right">
        <div style="color:var(--amber);font-weight:700">${e.pct}%</div>
        <div style="font-size:11px;color:var(--muted)">${e.done} leçons</div>
      </div>
    </div>`).join('')}`;
}

function loadDB2(){
  // Returns the in-memory DB (populated from server on login)
  return DB;
}

// ══════════════════════════════════════════
// STUDY CALENDAR
// ══════════════════════════════════════════
function renderCalendar(){
  if(!currentUser) return;
  const today = new Date();
  const dayNames = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());

  // Week label
  const opts = {month:'short', day:'numeric'};
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
  document.getElementById('cal-week-label').textContent =
    `${weekStart.toLocaleDateString('fr-FR',opts)} – ${weekEnd.toLocaleDateString('fr-FR',opts)}`;

  // Build activity map from quiz history
  const actMap = {};
  (currentUser.quizHistory||[]).forEach(q=>{
    if(q.date){ const d=q.date.split('T')[0]; actMap[d]=(actMap[d]||0)+1; }
  });
  (currentUser.completed||[]).forEach(k=>{
    const d = today.toISOString().split('T')[0]; // approximate
    actMap[d]=(actMap[d]||0)+0.5;
  });

  // Grid: 7 day cells
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  for(let i=0;i<7;i++){
    const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
    const key = d.toISOString().split('T')[0];
    const isToday = d.toDateString()===today.toDateString();
    const acts = actMap[key]||0;
    const intensity = acts===0?0:acts<2?1:acts<4?2:3;
    const colors = ['rgba(255,255,255,0.04)','rgba(99,102,241,0.2)','rgba(99,102,241,0.45)','rgba(99,102,241,0.8)'];
    grid.innerHTML += `
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="font-size:10px;color:var(--muted)">${dayNames[d.getDay()]}</div>
        <div style="width:36px;height:36px;border-radius:8px;background:${colors[intensity]};border:${isToday?'2px solid var(--accent)':'1px solid var(--border)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${isToday?'var(--accent)':'var(--muted)'}">
          ${d.getDate()}
        </div>
        ${acts>0?`<div style="width:6px;height:6px;border-radius:50%;background:var(--accent)"></div>`:'<div style="width:6px;height:6px"></div>'}
      </div>`;
  }

  // Activity feed — last 5 quiz results
  const recent = [...(currentUser.quizHistory||[])].reverse().slice(0,5);
  document.getElementById('cal-activity').innerHTML = recent.length===0
    ? `<div style="color:var(--muted);font-size:13px;padding:10px 0">Aucune activité récente — commence une leçon! 🚀</div>`
    : recent.map(q=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="width:36px;height:36px;border-radius:8px;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;font-size:16px">${q.score>=70?'✅':'🔄'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${q.title||q.lesson}</div>
          <div style="font-size:11px;color:var(--muted)">${new Date(q.date||Date.now()).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</div>
        </div>
        <div style="font-weight:700;color:${q.score>=70?'var(--jade)':'var(--rose)'};font-size:14px">${Math.round(q.score)}%</div>
      </div>`).join('');

  // Weekly goal
  const weeklyGoal = 5; // lessons/quizzes per week
  const thisWeekActs = Object.values(actMap).reduce((s,v)=>s+v,0);
  const weeklyPct = Math.min(100, Math.round(thisWeekActs/weeklyGoal*100));
  document.getElementById('cal-goal-fill').style.width = weeklyPct+'%';
  document.getElementById('cal-goal-txt').textContent =
    `${Math.round(thisWeekActs)} / ${weeklyGoal} activités cette semaine (${weeklyPct}%)`;
}

// ══════════════════════════════════════════
// MESSAGING (student ↔ tutor ↔ parent ↔ teacher)
// ══════════════════════════════════════════

function _getMsgContacts() {
  if (!currentUser) return [];
  const contacts = [];
  const seen = new Set();

  if (currentUser.role === 'student') {
    // Student: all linked tutors/parents
    (DB.users || []).forEach(u => {
      if ((u.role === 'tutor' || u.role === 'parent') &&
          (u.linkedStudents || []).includes(currentUser.code) &&
          !seen.has(u.id)) {
        seen.add(u.id);
        contacts.push(u);
      }
    });
    // Also from linkedUserProfiles
    (currentUser.linkedUserProfiles || []).forEach(lp => {
      if (!seen.has(lp.id)) { seen.add(lp.id); contacts.push(lp); }
    });
  } else if (currentUser.role === 'admin') {
    // Admin/teacher: all users
    (DB.users || []).forEach(u => {
      if (u.id !== currentUser.id && !seen.has(u.id)) { seen.add(u.id); contacts.push(u); }
    });
  } else {
    // Tutor / parent: all linked students + any other tutors/parents of same students
    (currentUser.linkedUserProfiles || []).forEach(lp => {
      if (!seen.has(lp.id)) { seen.add(lp.id); contacts.push(lp); }
    });
    // Also from DB users
    (currentUser.linkedStudents || []).forEach(code => {
      const st = (DB.users || []).find(u => u.code === code);
      if (st && !seen.has(st.id)) { seen.add(st.id); contacts.push(st); }
    });
  }
  return contacts;
}

function _getRoleLabel(role) {
  if (role === 'tutor') return '👩‍🏫 Tuteur';
  if (role === 'parent') return '👨‍👩‍👧 Parent';
  if (role === 'admin') return '🛡️ Admin';
  return '👩🏾‍🔬 Élève';
}

function _getRoleAvatar(role) {
  if (role === 'tutor') return '👩‍🏫';
  if (role === 'parent') return '👨‍👩‍👧';
  if (role === 'admin') return '🛡️';
  return '👩🏾‍🔬';
}

async function renderMessages() {
  if (!currentUser) return;
  const contacts = _getMsgContacts();
  document.getElementById('msg-screen-title').textContent = '💬 Messages';

  if (_msgViewMode === 'contacts' || !msgTargetId) {
    showMsgContacts(contacts);
  } else {
    await openMessageThread(msgTargetId);
  }
}

function showMsgContacts(contacts) {
  _msgViewMode = 'contacts';
  const contactsEl = document.getElementById('msg-contacts-view');
  const threadEl   = document.getElementById('msg-thread-view');
  if (contactsEl) contactsEl.style.display = 'block';
  if (threadEl)   threadEl.style.display   = 'none';

  const list = document.getElementById('msg-contacts-list');
  const noContacts = document.getElementById('msg-no-contacts');
  const allContacts = contacts || _getMsgContacts();
  document.getElementById('msg-screen-title').textContent = '💬 Messages';

  if (!allContacts.length) {
    if (list) list.innerHTML = '';
    if (noContacts) noContacts.style.display = 'block';
    return;
  }
  if (noContacts) noContacts.style.display = 'none';
  if (!list) return;

  list.innerHTML = allContacts.map(c => {
    const name = c.fname || c.name || 'Utilisateur';
    const roleLabel = _getRoleLabel(c.role);
    const av = c.avatar || _getRoleAvatar(c.role);
    return `<div class="msg-contact-item" onclick="openMessageThread('${c.id}')">
      <div class="msg-contact-avatar">${av}</div>
      <div style="flex:1">
        <div class="msg-contact-name">${escHtml(name)}</div>
        <div class="msg-contact-role">${roleLabel}${c.code ? ' · ' + escHtml(c.code) : ''}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:var(--muted)"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;
  }).join('');
}

async function openMessageThread(contactId) {
  if (!currentUser || !contactId) return;
  msgTargetId = contactId;
  _msgViewMode = 'thread';

  const contact = (DB.users || []).find(u => u.id === contactId) ||
    (currentUser.linkedUserProfiles || []).find(u => u.id === contactId);
  const otherName = contact ? (contact.fname || contact.name || 'Utilisateur') : 'Contact';
  const roleLabel = contact ? _getRoleLabel(contact.role) : '';

  document.getElementById('msg-screen-title').textContent = `💬 ${escHtml(otherName)}`;
  const contactsEl = document.getElementById('msg-contacts-view');
  const threadEl   = document.getElementById('msg-thread-view');
  if (contactsEl) contactsEl.style.display = 'none';
  if (threadEl)   { threadEl.style.display = 'flex'; threadEl.style.flexDirection = 'column'; }

  const infoEl = document.getElementById('msg-student-info');
  if (infoEl) infoEl.textContent = `${roleLabel} · ${escHtml(otherName)}${contact?.code ? ' (' + escHtml(contact.code) + ')' : ''}`;

  // Fetch messages from API
  const threadKey = [currentUser.id, msgTargetId].sort().join('_');
  try {
    const res = await _apiCall('GET', `/messages?with=${msgTargetId}`);
    if (res.ok) {
      const apiMsgs = await res.json();
      if (!DB.messages) DB.messages = {};
      DB.messages[threadKey] = apiMsgs.map(m => ({ senderId: m.senderId, text: m.text, ts: new Date(m.ts).getTime() }));
    }
  } catch {}

  _renderThread(threadKey);
}

function _renderThread(threadKey) {
  const messages = DB.messages?.[threadKey] || [];
  const threadDiv = document.getElementById('msg-thread');
  if (!threadDiv) return;
  threadDiv.innerHTML = messages.length === 0
    ? `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Aucun message — commencez la conversation! 👋</div>`
    : messages.map(m => {
        const isMe = m.senderId === currentUser.id;
        return `<div style="display:flex;${isMe ? 'justify-content:flex-end' : ''}">
          <div style="max-width:80%;background:${isMe ? 'var(--accent)' : 'rgba(255,255,255,0.07)'};border-radius:${isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};padding:10px 14px">
            <div style="font-size:14px;line-height:1.5">${escHtml(m.text)}</div>
            <div style="font-size:10px;color:${isMe ? 'rgba(255,255,255,0.6)' : 'var(--muted)'};margin-top:4px;text-align:right">${new Date(m.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>`;
      }).join('');
  setTimeout(() => { threadDiv.scrollTop = threadDiv.scrollHeight; }, 50);
}

function msgHandleBack() {
  if (_msgViewMode === 'thread') {
    showMsgContacts();
  } else {
    goBack();
  }
}

async function sendMessage() {
  const inp = document.getElementById('msg-input');
  const text = inp?.value?.trim();
  if (!text || !currentUser || !msgTargetId) { showToast('Aucun destinataire sélectionné', 'warn'); return; }
  inp.value = '';
  try {
    const res = await _apiCall('POST', '/messages', { recipientId: msgTargetId, text });
    if (!res.ok) { showToast('Erreur envoi message', 'warn'); return; }
    const msg = await res.json();
    const threadKey = [currentUser.id, msgTargetId].sort().join('_');
    if (!DB.messages) DB.messages = {};
    if (!DB.messages[threadKey]) DB.messages[threadKey] = [];
    DB.messages[threadKey].push({ senderId: currentUser.id, text, ts: new Date(msg.ts).getTime() || Date.now() });
    _renderThread(threadKey);
  } catch {
    showToast('Erreur réseau', 'warn');
  }
}

(document.getElementById('msg-input') || {}).addEventListener?.('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

function getRecommendedNext(){
  if(!currentUser) return null;
  const completed = currentUser.completedLessons||[];
  // Priority 1: a lesson with low quiz score (needs review)
  for(const [subjKey, subj] of Object.entries(SUBJECTS)){
    for(const ch of subj.chapters){
      const score = getLessonQuizScore(ch.key);
      if(score !== null && score < 60){
        return { key:ch.key, chId:ch.id, title:`🔄 Réviser: ${ch.title}` };
      }
    }
  }
  // Priority 2: next unstarted lesson in subject with best avg score
  const subjsByScore = Object.entries(SUBJECTS).sort((a,b)=>
    (getSubjectAvgScore(b[0])||0)-(getSubjectAvgScore(a[0])||0)
  );
  for(const [subjKey, subj] of subjsByScore){
    const nextCh = subj.chapters.find(ch=>!completed.includes(ch.id));
    if(nextCh) return { key:nextCh.key, chId:nextCh.id, title:`🚀 Continuer: ${nextCh.title}` };
  }
  return null;
}

function getWeakAreas(){
  if(!currentUser) return [];
  return Object.entries(SUBJECTS)
    .map(([key,s])=>({ key, subj:s, avg:getSubjectAvgScore(key) }))
    .filter(x=>x.avg !== null && x.avg < 70)
    .sort((a,b)=>a.avg-b.avg)
    .slice(0,3);
}

function renderWeakAreas(){
  const el = document.getElementById('weak-areas');
  if(!el) return;
  const weak = getWeakAreas();
  if(!weak.length){
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:10px 0">🌟 Excellent! Pas de zone faible détectée. Continue comme ça!</div>`;
    return;
  }
  el.innerHTML = weak.map(w=>`
    <div onclick="openSubject('${w.key}')" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px;margin-bottom:8px;cursor:pointer">
      <div style="font-size:22px">${w.subj.icon}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${w.subj.name}</div>
        <div style="font-size:11px;color:var(--muted)">Moyenne: ${Math.round(w.avg)}% — À retravailler</div>
      </div>
      <div style="background:rgba(239,68,68,.15);color:#f87171;border-radius:8px;padding:4px 10px;font-size:13px;font-weight:700">${Math.round(w.avg)}%</div>
    </div>`).join('');
}

// ══════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════
let _adminData = { students: [], parents: [], tutors: [] };
let _adminTab  = 'students';

async function renderAdmin() {
  try {
    const res = await _apiCall('GET', '/admin/users');
    if (!res.ok) { showToast('Erreur chargement admin', 'warn'); return; }
    _adminData = await res.json();
  } catch(e) {
    showToast('Erreur réseau', 'warn'); return;
  }

  const s = _adminData.students.length;
  const p = _adminData.parents.length;
  const t = _adminData.tutors.length;
  document.getElementById('admin-stats').innerHTML = [
    ['👩🏾‍🔬', 'Élèves',   s, '#6366f1'],
    ['👨‍👩‍👧', 'Parents',  p, '#10b981'],
    ['👩‍🏫', 'Tuteurs',  t, '#f59e0b'],
  ].map(([icon, label, count, color]) => `
    <div style="flex:1;min-width:100px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:14px 16px;text-align:center">
      <div style="font-size:22px">${icon}</div>
      <div style="font-size:24px;font-weight:700;color:${color}">${count}</div>
      <div style="font-size:12px;color:var(--muted)">${label}</div>
    </div>`).join('');

  adminTab(_adminTab);
}

function adminTab(tab) {
  _adminTab = tab;
  ['students','parents','tutors'].forEach(t => {
    const btn = document.getElementById('admin-tab-' + t);
    if (btn) btn.className = t === tab ? 'btn btn-primary' : 'btn btn-ghost';
    if (btn) btn.style.cssText = 'font-size:13px;padding:8px 16px';
  });
  document.getElementById('admin-search').value = '';
  adminFilter();
}

function adminFilter() {
  const q = (document.getElementById('admin-search').value || '').toLowerCase();
  const rows = _adminData[_adminTab] || [];
  const filtered = q
    ? rows.filter(u => `${u.fname} ${u.lname} ${u.email}`.toLowerCase().includes(q))
    : rows;

  const thead = document.getElementById('admin-thead');
  const tbody = document.getElementById('admin-tbody');
  const empty = document.getElementById('admin-empty');

  // Build header based on tab
  const isStudent = _adminTab === 'students';
  thead.innerHTML = `<tr style="border-bottom:1px solid var(--border);text-align:left">
    <th style="padding:10px 8px;color:var(--muted);font-weight:600">Nom</th>
    <th style="padding:10px 8px;color:var(--muted);font-weight:600">Email</th>
    ${isStudent
      ? `<th style="padding:10px 8px;color:var(--muted);font-weight:600">Code</th>
         <th style="padding:10px 8px;color:var(--muted);font-weight:600">XP</th>
         <th style="padding:10px 8px;color:var(--muted);font-weight:600">Niveau</th>`
      : `<th style="padding:10px 8px;color:var(--muted);font-weight:600">Élèves liés</th>`}
    <th style="padding:10px 8px;color:var(--muted);font-weight:600">Inscrit</th>
    <th style="padding:10px 8px"></th>
  </tr>`;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(u => {
    const name   = escHtml(`${u.fname} ${u.lname}`.trim());
    const email  = escHtml(u.email);
    const date   = u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—';
    const extra  = isStudent
      ? `<td style="padding:10px 8px;font-family:monospace;font-size:12px">${escHtml(u.code||'')}</td>
         <td style="padding:10px 8px">${u.xp ?? 0}</td>
         <td style="padding:10px 8px">${u.level ?? 1}</td>`
      : `<td style="padding:10px 8px">${u.linkedCount ?? 0}</td>`;
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05)" data-id="${u.id}">
      <td style="padding:10px 8px;font-weight:500">${name}</td>
      <td style="padding:10px 8px;color:var(--muted);font-size:12px">${email}</td>
      ${extra}
      <td style="padding:10px 8px;color:var(--muted);font-size:12px">${date}</td>
      <td style="padding:10px 8px;text-align:right">
        <button onclick="adminDeleteUser('${u.id}','${name}')"
          style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#f87171;border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer">
          Supprimer
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function adminDeleteUser(id, name) {
  if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
  try {
    const res = await _apiCall('DELETE', `/admin/users/${id}`);
    if (!res.ok) { showToast('Échec de la suppression', 'warn'); return; }
    showToast(`${name} supprimé`);
    // Remove from local data and re-render
    ['students','parents','tutors'].forEach(tab => {
      _adminData[tab] = _adminData[tab].filter(u => u.id !== id);
    });
    renderAdmin();
  } catch(e) {
    showToast('Erreur réseau', 'warn');
  }
}

// ══════════════════════════════════════════
// DAILY PUZZLE ENGINE
// ══════════════════════════════════════════

// Subject → related VOCAB keywords for subject-filtered puzzles
const PUZZLE_SUBJECT_KEYS = {
  math:    ['Coefficient','Équation','Vecteur','Probabilité','Statistique','Trigonométrie','Discriminant','Logarithme','Algèbre'],
  phys:    ['Accélération','Vitesse','Force','Inertie','Énergie','Puissance','Gravité','Pression','Circuit'],
  chem:    ['Acide','Atome','Molécule','Isotope','Électron','Proton','Réaction','Oxydation','Enzyme'],
  ela:     ['Grammaire','Littérature','Narrateur','Métaphore','Thème','Analyse','Argument','Paragraphe'],
  sci:     ['Cellule','Chromosome','Photosynthèse','Évolution','Génétique','Écosystème','Biome','ADN'],
  earth:   ['Atmosphère','Latitude','Longitude','Tectonique','Volcan','Sismique','Orbite','Écosystème'],
  ushist:  ['Démocratie','Constitution','Congrès','Révolution','Droits','Liberté','Suffrage','Immigration'],
  civics:  ['Démocratie','Constitution','Gouvernement','Vote','Citoyen','Liberté','Droits','Congrès'],
  cs:      ['Algorithme','Variable','Boucle','Fonction','Réseau','Données','Programme','Intelligence'],
  health:  ['Nutrition','Métabolisme','Immunité','Vaccination','Anxiété','Diète','Hormones','Santé'],
  finance: ['Budget','Épargne','Investissement','Taxe','Capital','Intérêt','Bourse','Revenu'],
  french:  ['Grammaire','Littérature','Pronom','Conjugaison','Adverbe','Récit','Poème','Subjunctif'],
};

// Get VOCAB entries that belong to a subject (or all if no match)
function _getPuzzleVocabForSubject(subjKey) {
  const keywords = PUZZLE_SUBJECT_KEYS[subjKey];
  if (!keywords || !keywords.length) return VOCAB;
  const lc = keywords.map(k => k.toLowerCase());
  const filtered = VOCAB.filter(v =>
    lc.some(k => v.fr.toLowerCase().includes(k) || v.en.toLowerCase().includes(k) || v.hint.toLowerCase().includes(k))
  );
  return filtered.length >= 3 ? filtered : VOCAB;
}

// Deterministic puzzle index for the day
function _getDayNumber() {
  return Math.floor(Date.now() / 86400000);
}

// Generate the puzzle word+hint for given day+subject+index
function _generatePuzzle(subjKey, dayIndex) {
  const pool = _getPuzzleVocabForSubject(subjKey);
  const rand = seededRand((_getDayNumber() + dayIndex) * 31337 + (subjKey ? subjKey.charCodeAt(0) * 7 : 1));
  const idx = Math.floor(rand() * pool.length);
  const entry = pool[idx];
  return {
    word: entry.en.toUpperCase().replace(/[^A-Z]/g, ''),
    hint: entry.hint || entry.fr,
    fr: entry.fr,
    en: entry.en,
  };
}

// Check if puzzle already solved today
function _getPuzzleStorageKey(subjKey, dayNum, idx) {
  return `puzzle_done_${subjKey}_${dayNum}_${idx}`;
}

function _isPuzzleDoneToday(subjKey, dayNum, idx) {
  return localStorage.getItem(_getPuzzleStorageKey(subjKey, dayNum, idx)) === '1';
}

function _markPuzzleDone(subjKey, dayNum, idx) {
  localStorage.setItem(_getPuzzleStorageKey(subjKey, dayNum, idx), '1');
}

function pickPuzzleSubject() {
  document.getElementById('puzzle-subject-picker').style.display = 'block';
  document.getElementById('puzzle-game-area').style.display = 'none';
}

// Maximum number of past days to scan when computing the puzzle daily streak
const PUZZLE_STREAK_WINDOW = 30;

function renderPuzzle() {
  const picker = document.getElementById('puzzle-subject-picker');
  const gameArea = document.getElementById('puzzle-game-area');

  // Streak badge — count consecutive days with at least one completed puzzle
  const sb = document.getElementById('puzzle-streak-badge');
  if (sb) {
    const dayNum = _getDayNumber();
    let streak = 0;
    let d = dayNum;
    while (d > dayNum - PUZZLE_STREAK_WINDOW) {
      const done = Object.keys(SUBJECTS).some(k =>
        _isPuzzleDoneToday(k, d, 0) || _isPuzzleDoneToday(k, d, 1)
      );
      if (!done) break;
      streak++;
      d--;
    }
    sb.textContent = streak > 0 ? `🔥 ${streak} jour${streak > 1 ? 's' : ''}` : '';
    sb.style.display = streak > 0 ? 'inline-flex' : 'none';
  }

  if (!_puzzleSubject) {
    // Show subject picker
    if (picker) picker.style.display = 'block';
    if (gameArea) gameArea.style.display = 'none';
    _renderPuzzleSubjectList();
    return;
  }

  // Has subject — show game
  if (picker) picker.style.display = 'none';
  if (gameArea) gameArea.style.display = 'block';
  _startPuzzleGame(_puzzleSubject, _puzzleIndex);
}

function _renderPuzzleSubjectList() {
  const list = document.getElementById('puzzle-subject-list');
  if (!list) return;
  const dayNum = _getDayNumber();
  list.innerHTML = Object.entries(SUBJECTS).slice(0, 12).map(([key, subj]) => {
    const done = _isPuzzleDoneToday(key, dayNum, 0);
    return `<button class="puzzle-subject-btn" onclick="selectPuzzleSubject('${key}')">
      <span style="font-size:24px">${subj.icon}</span>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${subj.name}</div>
        <div style="font-size:11px;color:var(--muted)">${subj.nameEn}</div>
      </div>
      ${done ? '<span style="color:var(--mint);font-size:14px" title="Complété aujourd\'hui">✅</span>' : '<span style="color:var(--muted);font-size:12px">→</span>'}
    </button>`;
  }).join('');
}

function selectPuzzleSubject(subjKey) {
  _puzzleSubject = subjKey;
  _puzzleIndex = 0;
  renderPuzzle();
}

function _startPuzzleGame(subjKey, idx) {
  const dayNum = _getDayNumber();
  const subj = SUBJECTS[subjKey];
  const puzzle = _generatePuzzle(subjKey, idx);

  // Update labels
  const subjLabel = document.getElementById('puzzle-subject-label');
  if (subjLabel) subjLabel.textContent = `${subj?.icon || '🧩'} ${subj?.name || subjKey}`;
  const dayLabel = document.getElementById('puzzle-day-label');
  if (dayLabel) {
    const d = new Date();
    dayLabel.textContent = `Puzzle du ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  }
  const typeLabel = document.getElementById('puzzle-type-label');
  if (typeLabel) typeLabel.textContent = '🔤 Reconstitue le mot en anglais';

  // Scramble area
  document.getElementById('puzzle-scramble').style.display = 'block';
  document.getElementById('puzzle-success').style.display = 'none';
  document.getElementById('puzzle-done-today').style.display = 'none';
  document.getElementById('puzzle-feedback').textContent = '';
  document.getElementById('puzzle-feedback').style.color = 'var(--muted)';

  const hintBox = document.getElementById('puzzle-hint-text');
  if (hintBox) hintBox.textContent = `💡 Définition: ${puzzle.hint}`;
  hintBox.style.display = 'block';

  // Reset state
  _puzzleWord = puzzle.word;
  _puzzleAnswer = [];
  _puzzleHintUsed = false;

  // Create shuffled letter tiles (seeded so they look scrambled but consistent within the session)
  const letters = puzzle.word.split('');
  // Just shuffle visually with Math.random (not seeded — different each session)
  _puzzleLetterOrder = shuffleArray(letters.map((l, i) => ({ letter: l, origIdx: i })));

  _renderPuzzleTiles();

  // Check if already done
  if (_isPuzzleDoneToday(subjKey, dayNum, idx)) {
    document.getElementById('puzzle-scramble').style.display = 'none';
    document.getElementById('puzzle-done-today').style.display = 'block';
  }
}

function _renderPuzzleTiles() {
  const answerRow = document.getElementById('puzzle-answer-slots');
  const lettersRow = document.getElementById('puzzle-letter-tiles');
  if (!answerRow || !lettersRow) return;

  // Answer slots (what user has built)
  answerRow.innerHTML = _puzzleAnswer.map((item, i) =>
    `<div class="puzzle-tile answer-slot" onclick="removePuzzleLetter(${i})" title="Cliquer pour retirer">${item.letter}</div>`
  ).join('');

  // Available letter tiles
  lettersRow.innerHTML = _puzzleLetterOrder.map((item, i) => {
    const used = _puzzleAnswer.some(a => a.origIdx === item.origIdx);
    return `<div class="puzzle-tile ${used ? 'used' : ''}" onclick="${used ? '' : `addPuzzleLetter(${i})`}">${item.letter}</div>`;
  }).join('');
}

function addPuzzleLetter(tileIdx) {
  const item = _puzzleLetterOrder[tileIdx];
  if (!item) return;
  if (_puzzleAnswer.some(a => a.origIdx === item.origIdx)) return; // already used
  _puzzleAnswer.push({ letter: item.letter, origIdx: item.origIdx });
  _renderPuzzleTiles();
}

function removePuzzleLetter(ansIdx) {
  _puzzleAnswer.splice(ansIdx, 1);
  _renderPuzzleTiles();
}

function clearPuzzleAnswer() {
  _puzzleAnswer = [];
  _renderPuzzleTiles();
  document.getElementById('puzzle-feedback').textContent = '';
}

function checkPuzzleAnswer() {
  const formed = _puzzleAnswer.map(a => a.letter).join('');
  const feedback = document.getElementById('puzzle-feedback');
  if (formed.length < _puzzleWord.length) {
    feedback.textContent = 'Place toutes les lettres!';
    feedback.style.color = 'var(--amber)';
    return;
  }
  if (formed === _puzzleWord) {
    // Correct!
    const xpBonus = _puzzleHintUsed ? 15 : 30;
    document.getElementById('puzzle-scramble').style.display = 'none';
    document.getElementById('puzzle-success').style.display = 'block';
    const puzzle = _generatePuzzle(_puzzleSubject, _puzzleIndex);
    document.getElementById('puzzle-success-word').textContent = puzzle.en;
    document.getElementById('puzzle-success-info').textContent = puzzle.fr + ' — ' + puzzle.hint;
    document.getElementById('puzzle-xp-earned').textContent = `+${xpBonus} XP Gagné!`;
    const emojis = ['🎉','🥳','🎊','🏆','🌟','⭐','💎','🚀'];
    document.getElementById('puzzle-success-emoji').textContent = emojis[Math.floor(Math.random() * emojis.length)];
    _markPuzzleDone(_puzzleSubject, _getDayNumber(), _puzzleIndex);
    addXP(xpBonus);
    unlockBadge('first');
    showEmojiReaction('complete');
    // Update home puzzle status
    const homePuzzleStatus = document.getElementById('home-puzzle-status');
    if (homePuzzleStatus) homePuzzleStatus.textContent = '✅ Puzzle du jour complété!';
  } else {
    feedback.textContent = '❌ Pas tout à fait... Réessaie!';
    feedback.style.color = 'var(--coral)';
    showEmojiReaction('wrong');
    // Shake the answer row
    const ar = document.getElementById('puzzle-answer-slots');
    if (ar) { ar.style.animation = 'none'; setTimeout(() => { ar.style.animation = ''; }, 10); }
  }
}

function showPuzzleHint() {
  if (_puzzleHintUsed) { showToast('Indice déjà utilisé!', 'warn'); return; }
  _puzzleHintUsed = true;
  addXP(-5);
  const puzzle = _generatePuzzle(_puzzleSubject, _puzzleIndex);
  const hintBox = document.getElementById('puzzle-hint-text');
  // Reveal first letter
  if (hintBox) hintBox.textContent = `💡 ${puzzle.hint} — Première lettre: "${puzzle.word[0]}"`;
  showToast('Indice: première lettre révélée (−5 XP)');
  // Auto-place the first letter if not already placed
  if (_puzzleAnswer.length === 0) {
    const targetLetter = puzzle.word[0];
    const firstTile = _puzzleLetterOrder.findIndex(t =>
      t.letter === targetLetter && !_puzzleAnswer.some(a => a.origIdx === t.origIdx)
    );
    if (firstTile >= 0) addPuzzleLetter(firstTile);
  }
}

function nextDailyPuzzle() {
  _puzzleIndex = (_puzzleIndex + 1) % 5;
  _startPuzzleGame(_puzzleSubject, _puzzleIndex);
}

(async function init(){
  await loadDB();
  updateOnline();
  if(currentUser) updateStreak();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  setInterval(()=>{ if(document.getElementById('quest-time')) document.getElementById('quest-time').textContent = getQuestTimeLeft(); }, 60000);
  // Update home puzzle status
  const homePuzzleStatus = document.getElementById('home-puzzle-status');
  if (homePuzzleStatus && currentUser) {
    const dayNum = _getDayNumber();
    const anyDone = Object.keys(SUBJECTS).some(k => _isPuzzleDoneToday(k, dayNum, 0));
    if (anyDone) homePuzzleStatus.textContent = '✅ Puzzle du jour complété!';
  }
  requestNotifPermission();
})();