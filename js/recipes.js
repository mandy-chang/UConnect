// AI Nutrition: Claude suggests recipes made from what's in stock, aimed at a child's age.

const AGES = ['1-3', '4-8', '9-13', '14-18'];

// Daily needs for kids, from the U.S. Dietary Reference Intakes.
// When there are two numbers, the first is for girls and the second for boys.
const DAILY_NEEDS = {
  '1-3': { protein: [13], calcium: [700], iron: [7], fiber: [19] },
  '4-8': { protein: [19], calcium: [1000], iron: [10], fiber: [25] },
  '9-13': { protein: [34], calcium: [1300], iron: [8], fiber: [26, 31] },
  '14-18': { protein: [46, 52], calcium: [1300], iron: [11, 15], fiber: [26, 38] }
};
const NUTRIENTS = ['protein', 'calcium', 'iron', 'fiber'];
const NUTRIENT_UNITS = { protein: 'g', calcium: 'mg', iron: 'mg', fiber: 'g' };

const DIETS = ['veg', 'halal', 'nopork', 'dairy', 'nut', 'gluten'];
const KITCHENS = ['stove', 'micro', 'none'];
const FOOD_GROUPS = ['fruits', 'vegetables', 'grains', 'protein', 'dairy'];

// How we describe the choices to the AI (always in English)
const DIET_FOR_AI = {
  veg: 'vegetarian',
  halal: 'halal',
  nopork: 'no pork',
  dairy: 'dairy-free',
  nut: 'nut allergy (no peanuts or tree nuts)',
  gluten: 'gluten-free'
};
const KITCHEN_FOR_AI = {
  stove: 'a stovetop and basic pots and pans',
  micro: 'only a microwave',
  none: 'no cooking at all (assemble only)'
};
const LANGUAGE_FOR_AI = { en: 'English', es: 'Spanish', zh: 'Simplified Chinese', ru: 'Russian' };

const recipeForm = {
  age: '4-8',
  ingredients: null, // a Set of item ids, filled in once the stock has loaded
  diets: new Set(),
  kitchen: 'stove'
};

const recipeResults = {
  busy: false,
  stopper: null, // lets the Stop button cancel the request
  recipes: null,
  errorKey: null
};

function foodInStock() {
  const food = state.stock.filter(item => FOOD_CATEGORIES.includes(item.category) && stockStatus(item) !== 'out');
  return sortByName(food);
}

function renderRecipesPage() {
  renderRecipeForm();
  renderRecipeResults();
}


// ----- The form on the left -----

function renderRecipeForm() {
  $('#ageChips').innerHTML = AGES
    .map(age => chipButton('age', age, t('years', { a: age.replace('-', '–') }), recipeForm.age === age))
    .join('');

  renderDailyNeeds();
  renderIngredientChips();

  $('#dietChips').innerHTML = DIETS
    .map(diet => chipButton('diet', diet, t('diet_' + diet), recipeForm.diets.has(diet)))
    .join('');

  $('#kitchenChips').innerHTML = KITCHENS
    .map(kitchen => chipButton('kitchen', kitchen, t('kitchen_' + kitchen), recipeForm.kitchen === kitchen))
    .join('');
}

function renderIngredientChips() {
  const box = $('#ingredientChips');
  const food = foodInStock();

  // the first time, start with the five things we have the most of
  if (recipeForm.ingredients === null && state.loaded.stock) {
    const mostStocked = food.slice().sort((a, b) => amountOf(b) - amountOf(a)).slice(0, 5);
    recipeForm.ingredients = new Set(mostStocked.map(item => item.id));
  }

  const waiting = loadingText('stock');
  if (waiting) {
    box.innerHTML = `<p class="muted">${escapeHtml(waiting)}</p>`;
    return;
  }
  if (food.length === 0) {
    box.innerHTML = `<p class="muted">${escapeHtml(t('no_ingredients'))}</p>`;
    return;
  }

  const chosen = recipeForm.ingredients || new Set();
  box.innerHTML = food
    .map(item => chipButton('ingredient', item.id, itemName(item), chosen.has(item.id)))
    .join('');
}

// The four boxes showing protein, calcium, iron and fiber for the chosen age
function renderDailyNeeds() {
  const needs = DAILY_NEEDS[recipeForm.age];

  const boxes = NUTRIENTS.map(nutrient => {
    const numbers = needs[nutrient].map(amount => formatNumber(amount)).join('–');
    const amount = numbers + ' ' + t('unit_' + NUTRIENT_UNITS[nutrient]);
    return `<div class="target"><b>${escapeHtml(amount)}</b><span>${escapeHtml(t('n_' + nutrient))}</span></div>`;
  });

  const title = t('daily_targets', { a: recipeForm.age.replace('-', '–') });
  $('#targetsBox').innerHTML = `
    <p class="targets-title">${escapeHtml(title)}</p>
    <div class="targets">${boxes.join('')}</div>
    <p class="targets-source">${escapeHtml(t('targets_source'))}</p>`;
}


// ----- The results on the right -----

function renderRecipeResults() {
  renderRecipeStatus();

  $('#recipeStop').hidden = !recipeResults.busy;
  $('#recipeButton').disabled = recipeResults.busy;

  const list = $('#recipeList');
  if (recipeResults.recipes && recipeResults.recipes.length > 0) {
    list.innerHTML = recipeResults.recipes.map(recipeCard).join('');
  } else if (recipeResults.busy) {
    list.innerHTML = '';
  } else {
    list.innerHTML = emptyRecipeArea();
  }
}

function renderRecipeStatus() {
  const box = $('#recipeStatus');
  box.className = 'recipe-status';

  if (recipeResults.busy) {
    box.innerHTML = `<span class="spinner"></span><span>${escapeHtml(t('thinking'))}</span>`;
  } else if (recipeResults.errorKey) {
    box.className = 'recipe-status bad';
    box.textContent = t(recipeResults.errorKey);
  } else if (!state.ai && state.connection !== 'waiting') {
    box.textContent = t('ai_unavailable');
  } else {
    box.innerHTML = '';
  }
}

function emptyRecipeArea() {
  const groups = FOOD_GROUPS
    .map(group => `<span class="food-group on ${group}">${escapeHtml(t('group_' + group))}</span>`)
    .join('');
  return `
    <div class="recipe-empty">
      <div class="plate">${groups}</div>
      <p>${escapeHtml(t('recipes_empty'))}</p>
    </div>`;
}

function recipeCard(recipe) {
  const covered = recipe.groups.map(group => group.toLowerCase());
  const groups = FOOD_GROUPS.map(group => {
    const on = covered.includes(group) ? 'on' : '';
    return `<span class="food-group ${group} ${on}">${escapeHtml(t('group_' + group))}</span>`;
  }).join('');

  const ingredients = recipe.ingredients.map(line => `<li>${escapeHtml(line)}</li>`).join('');
  const steps = recipe.steps.map(line => `<li>${escapeHtml(line)}</li>`).join('');

  let minutes = '';
  if (recipe.minutes) {
    minutes = `<span class="minutes">${escapeHtml(t('minutes', { n: formatNumber(recipe.minutes) }))}</span>`;
  }

  let growth = '';
  if (recipe.growth) {
    growth = `<p class="why-box"><b>${escapeHtml(t('why_growth'))}</b>${escapeHtml(recipe.growth)}</p>`;
  }

  let kidTip = '';
  if (recipe.kidTip) {
    kidTip = `<p class="tip-box"><b>${escapeHtml(t('kid_tip'))}</b>${escapeHtml(recipe.kidTip)}</p>`;
  }

  return `
    <article class="recipe">
      <div class="recipe-head">
        <h3>${escapeHtml(recipe.title)}</h3>
        ${minutes}
      </div>
      <div class="plate">${groups}</div>
      <div class="recipe-columns">
        <div>
          <h4>${escapeHtml(t('ingredients'))}</h4>
          <ul>${ingredients}</ul>
        </div>
        <div>
          <h4>${escapeHtml(t('steps'))}</h4>
          <ol>${steps}</ol>
        </div>
      </div>
      ${growth}
      ${kidTip}
    </article>`;
}


// ----- Asking the AI -----

function buildRecipePrompt() {
  const chosenIds = Array.from(recipeForm.ingredients || []);
  const ingredients = chosenIds.map(findItem).filter(Boolean).map(item => itemName(item, 'en'));
  const servings = Math.min(12, Math.max(1, parseInt($('#servings').value, 10) || 4));
  const needs = DAILY_NEEDS[recipeForm.age];
  const need = nutrient => needs[nutrient].join('–') + ' ' + NUTRIENT_UNITS[nutrient];

  let diets = Array.from(recipeForm.diets).map(diet => DIET_FOR_AI[diet]).join('; ');
  if (!diets) diets = 'none';

  const lines = [];
  lines.push('You help families who use a free community food pantry run by high school students.');
  lines.push(`Suggest 3 simple, low-cost recipes for a family with a child aged ${recipeForm.age} years. Each recipe makes ${servings} servings.`);

  if (ingredients.length > 0) {
    lines.push(`Build them mainly from these pantry items: ${ingredients.join(', ')}. You may add common staples (salt, pepper, oil, spices, water, flour, sugar).`);
  } else {
    lines.push('Use common low-cost pantry staples.');
  }

  lines.push(`Dietary needs: ${diets}. Never include anything that breaks these.`);
  lines.push(`Kitchen: ${KITCHEN_FOR_AI[recipeForm.kitchen]}.`);
  lines.push(`Daily nutrition targets for this age: protein ${need('protein')}, calcium ${need('calcium')}, iron ${need('iron')}, fiber ${need('fiber')}. Pick recipes that help meet them and that together cover the USDA MyPlate food groups.`);

  if (recipeForm.age === '1-3') {
    lines.push('The child is a toddler: avoid choking hazards (whole nuts, whole grapes, popcorn, hard raw chunks) and say to cut food small.');
  }

  lines.push(`Write every text value in ${LANGUAGE_FOR_AI[state.language]}. Keep steps short and practical for a busy parent.`);
  lines.push('Reply with only a JSON array of exactly 3 objects shaped like:');
  lines.push('{"title": "string", "minutes": 20, "ingredients": ["ingredient with amount"], "steps": ["short step"], "myplate": ["fruits" | "vegetables" | "grains" | "protein" | "dairy"], "growth": "1-2 sentences on which nutrients in this meal help a child grow", "kidTip": "one way to get kids involved or excited"}');

  return lines.join('\n');
}

// The AI's answer is checked and trimmed before we show any of it.
function cleanRecipe(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const title = cleanText(raw.title, 120);
  if (!title) return null;

  return {
    title: title,
    minutes: Math.max(0, Math.min(600, parseInt(raw.minutes, 10) || 0)),
    ingredients: cleanList(raw.ingredients, 20),
    steps: cleanList(raw.steps, 15),
    groups: cleanList(raw.myplate, 5),
    growth: cleanText(raw.growth, 400),
    kidTip: cleanText(raw.kidTip, 300)
  };
}

function cleanList(value, maxItems) {
  if (!Array.isArray(value)) return [];
  const lines = [];
  for (const line of value) {
    const text = cleanText(typeof line === 'string' ? line : '', 220);
    if (text) lines.push(text);
  }
  return lines.slice(0, maxItems);
}

async function makeRecipes(event) {
  event.preventDefault();
  if (recipeResults.busy) return;

  if (!state.ai) {
    recipeResults.errorKey = 'ai_unavailable';
    renderRecipeResults();
    return;
  }

  recipeResults.stopper = new AbortController();
  recipeResults.busy = true;
  recipeResults.errorKey = null;
  recipeResults.recipes = null;
  renderRecipeResults();

  try {
    const answer = await state.ai.json(buildRecipePrompt(), { signal: recipeResults.stopper.signal });
    let list = [];
    if (Array.isArray(answer)) list = answer;
    else if (answer && Array.isArray(answer.recipes)) list = answer.recipes;

    const recipes = list.slice(0, 3).map(cleanRecipe).filter(Boolean);
    if (recipes.length > 0) {
      recipeResults.recipes = recipes;
    } else {
      recipeResults.errorKey = 'ai_bad';
    }
  } catch (error) {
    recipeResults.errorKey = recipeErrorKey(error);
  }

  recipeResults.busy = false;
  recipeResults.stopper = null;
  renderRecipeResults();
}

// Turns the AI's error code into a message for the family.
function recipeErrorKey(error) {
  const code = error && error.code;
  if (code === 'cancelled') return null; // they pressed Stop
  if (code === 'rate_limited') return 'ai_rate';
  if (code === 'invalid_json' || code === 'empty_completion') return 'ai_bad';

  const turnedOff = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];
  if (turnedOff.includes(code)) return 'ai_declined';

  return 'ai_error';
}

function setupRecipes() {
  $('#recipeForm').addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const value = button.dataset.value;
    const action = button.dataset.action;

    if (action === 'age') {
      recipeForm.age = value;
    } else if (action === 'ingredient') {
      if (!recipeForm.ingredients) recipeForm.ingredients = new Set();
      toggleInSet(recipeForm.ingredients, value);
    } else if (action === 'diet') {
      toggleInSet(recipeForm.diets, value);
    } else if (action === 'kitchen') {
      recipeForm.kitchen = value;
    } else {
      return;
    }

    redrawAndKeepFocus(button, renderRecipeForm);
  });

  $('#recipeForm').addEventListener('submit', makeRecipes);

  $('#recipeStop').addEventListener('click', () => {
    if (recipeResults.stopper) recipeResults.stopper.abort();
  });
}
