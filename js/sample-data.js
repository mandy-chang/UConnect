// Places to get food near Union High School, and the sample shelf items.
// local-demo.js uses these the first time index.html is opened on a computer.
// (On the live site the same data is in the real database, and students edit it from the dashboard.)
//
// The places are real pantries in Vancouver, Camas and Washougal, WA (checked October 2026,
// from Washington 211 and each pantry's own website). Only the Union High School Student Pantry
// takes requests through UConnect; the others show on the map with hours, phone and directions.
// The shelf items are samples ("sample": true) until students count the real shelves.

const SAMPLE_DATA = {
  "pantries": {
    "p_uconnect": {
      "name": "Union High School Student Pantry",
      "type": "school",
      "address": "6201 NW Friberg-Strunk St, Camas, WA 98607",
      "hours": "Mon–Fri 3:00–5:00 PM",
      "phone": "",
      "website": "https://uhs.evergreenps.org",
      "note": "Union High students and their families",
      "lat": 45.62361,
      "lng": -122.46889,
      "sample": false,
      "takesRequests": true,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000,
      "pickup": {
        "days": [
          "mon",
          "tue",
          "wed",
          "thu",
          "fri"
        ],
        "start": "15:00",
        "end": "17:00",
        "minutes": 15,
        "perSlot": 4
      }
    },
    "p_fish_orchards": {
      "name": "FISH of Orchards",
      "type": "pantry",
      "address": "6012 NE 110th Ave, Vancouver, WA 98662",
      "hours": "Mon–Thu 10 AM–12 PM and 12:30–2:30 PM",
      "phone": "(360) 256-2440",
      "website": "https://www.fishoforchards.org",
      "note": "Open to everyone",
      "lat": 45.66618,
      "lng": -122.56041,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_salvation_vancouver": {
      "name": "The Salvation Army Vancouver",
      "type": "pantry",
      "address": "11018 NE 14th St, Vancouver, WA 98684",
      "hours": "Mon, Tue, Thu, Fri 10 AM–2:45 PM (closed 12:30–1:15)",
      "phone": "",
      "website": "https://vancouver.salvationarmy.org/vancouver_us_west/family-services",
      "note": "Washington residents. Uses a wait list.",
      "lat": 45.63194,
      "lng": -122.55872,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_evcc": {
      "name": "East Vancouver Community Church",
      "type": "pantry",
      "address": "12415 SE 7th St (church annex), Vancouver, WA 98683",
      "hours": "2nd Saturday of the month, 12–3 PM",
      "phone": "(360) 256-2780",
      "website": "https://www.eastvancouvercommunitychurch.com",
      "note": "Open to everyone",
      "lat": 45.61533,
      "lng": -122.54495,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_camas_friends": {
      "name": "Camas Friends Church",
      "type": "pantry",
      "address": "1004 NE 4th Ave, Camas, WA 98607",
      "hours": "Thu 1–5 PM",
      "phone": "(360) 834-2446",
      "website": "https://www.camasfriends.org/all-programs",
      "note": "Open to everyone",
      "lat": 45.58849,
      "lng": -122.39889,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_ifth": {
      "name": "Inter-Faith Treasure House",
      "type": "foodbank",
      "address": "91 C St, Washougal, WA 98671",
      "hours": "Mon–Fri 10 AM–2 PM",
      "phone": "(360) 834-4181",
      "website": "https://ifth-cw.org/food-bank",
      "note": "Camas and Washougal residents",
      "lat": 45.58087,
      "lng": -122.37916,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_salvation_washougal": {
      "name": "The Salvation Army Camas/Washougal",
      "type": "pantry",
      "address": "1612 I St, Washougal, WA 98671",
      "hours": "Tue–Fri 9 AM–4 PM (call first)",
      "phone": "(360) 835-3171",
      "website": "https://washougal.salvationarmy.org/",
      "note": "Low-income households. Call first.",
      "lat": 45.58444,
      "lng": -122.35458,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    },
    "p_ccacs": {
      "name": "Clark County Adventist Community Services",
      "type": "pantry",
      "address": "3114 E Fourth Plain Blvd, Vancouver, WA 98661",
      "hours": "Mon & Tue 9:30–11:30 AM and 12:30–3 PM",
      "phone": "(360) 695-8632",
      "website": "https://clarkcountyacs.com/get-help/",
      "note": "Open to everyone",
      "lat": 45.63783,
      "lng": -122.63875,
      "sample": false,
      "takesRequests": false,
      "createdAt": 1792368000000,
      "updatedAt": 1792368000000
    }
  },
  "stock": {
    "s_rice": {
      "names": {
        "en": "Rice",
        "es": "Arroz",
        "zh": "大米",
        "ru": "Рис"
      },
      "category": "grains",
      "qty": 24,
      "unit": "bags",
      "lowAt": 5,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_pasta": {
      "names": {
        "en": "Pasta",
        "es": "Pasta",
        "zh": "意大利面",
        "ru": "Макароны"
      },
      "category": "grains",
      "qty": 30,
      "unit": "boxes",
      "lowAt": 6,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "gluten"
      ],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_oats": {
      "names": {
        "en": "Oatmeal",
        "es": "Avena",
        "zh": "燕麦片",
        "ru": "Овсянка"
      },
      "category": "grains",
      "qty": 6,
      "unit": "boxes",
      "lowAt": 8,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "gluten"
      ],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_bread": {
      "names": {
        "en": "Whole wheat bread",
        "es": "Pan integral",
        "zh": "全麦面包",
        "ru": "Цельнозерновой хлеб"
      },
      "category": "grains",
      "qty": 0,
      "unit": "loaves",
      "lowAt": 4,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "gluten",
        "soy"
      ],
      "diets": [
        "vegetarian"
      ],
      "sample": true
    },
    "s_beans": {
      "names": {
        "en": "Black beans (canned)",
        "es": "Frijoles negros (lata)",
        "zh": "黑豆罐头",
        "ru": "Чёрная фасоль (консервы)"
      },
      "category": "protein",
      "qty": 40,
      "unit": "cans",
      "lowAt": 10,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_pb": {
      "names": {
        "en": "Peanut butter",
        "es": "Crema de cacahuate",
        "zh": "花生酱",
        "ru": "Арахисовая паста"
      },
      "category": "protein",
      "qty": 3,
      "unit": "jars",
      "lowAt": 6,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "nuts"
      ],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_tuna": {
      "names": {
        "en": "Canned tuna",
        "es": "Atún en lata",
        "zh": "金枪鱼罐头",
        "ru": "Тунец (консервы)"
      },
      "category": "protein",
      "qty": 18,
      "unit": "cans",
      "lowAt": 6,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "fish"
      ],
      "diets": [
        "halal"
      ],
      "sample": true
    },
    "s_eggs": {
      "names": {
        "en": "Eggs",
        "es": "Huevos",
        "zh": "鸡蛋",
        "ru": "Яйца"
      },
      "category": "protein",
      "qty": 0,
      "unit": "dozen",
      "lowAt": 4,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "eggs"
      ],
      "diets": [
        "vegetarian",
        "halal"
      ],
      "sample": true
    },
    "s_milk": {
      "names": {
        "en": "Shelf-stable milk",
        "es": "Leche de larga duración",
        "zh": "常温牛奶",
        "ru": "Молоко длительного хранения"
      },
      "category": "dairy",
      "qty": 12,
      "unit": "cartons",
      "lowAt": 6,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "dairy"
      ],
      "diets": [
        "vegetarian",
        "halal"
      ],
      "sample": true
    },
    "s_apples": {
      "names": {
        "en": "Apples",
        "es": "Manzanas",
        "zh": "苹果",
        "ru": "Яблоки"
      },
      "category": "produce",
      "qty": 35,
      "unit": "lb",
      "lowAt": 10,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_carrots": {
      "names": {
        "en": "Carrots",
        "es": "Zanahorias",
        "zh": "胡萝卜",
        "ru": "Морковь"
      },
      "category": "produce",
      "qty": 20,
      "unit": "lb",
      "lowAt": 8,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_corn": {
      "names": {
        "en": "Canned corn",
        "es": "Maíz en lata",
        "zh": "玉米罐头",
        "ru": "Кукуруза (консервы)"
      },
      "category": "canned",
      "qty": 4,
      "unit": "cans",
      "lowAt": 10,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_tomatoes": {
      "names": {
        "en": "Canned tomatoes",
        "es": "Tomates en lata",
        "zh": "番茄罐头",
        "ru": "Томаты (консервы)"
      },
      "category": "canned",
      "qty": 22,
      "unit": "cans",
      "lowAt": 8,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_formula": {
      "names": {
        "en": "Baby formula",
        "es": "Fórmula infantil",
        "zh": "婴儿配方奶粉",
        "ru": "Детская смесь"
      },
      "category": "baby",
      "qty": 0,
      "unit": "cans",
      "lowAt": 3,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "dairy"
      ],
      "diets": [],
      "sample": true
    },
    "s_diapers": {
      "names": {
        "en": "Diapers (size 4)",
        "es": "Pañales (talla 4)",
        "zh": "纸尿裤（4号）",
        "ru": "Подгузники (размер 4)"
      },
      "category": "baby",
      "qty": 8,
      "unit": "packs",
      "lowAt": 5,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [],
      "sample": true
    },
    "s_toothpaste": {
      "names": {
        "en": "Toothpaste",
        "es": "Pasta de dientes",
        "zh": "牙膏",
        "ru": "Зубная паста"
      },
      "category": "hygiene",
      "qty": 15,
      "unit": "tubes",
      "lowAt": 5,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [],
      "sample": true
    },
    "s_chicken": {
      "names": {
        "en": "Frozen chicken",
        "es": "Pollo congelado",
        "zh": "冷冻鸡肉",
        "ru": "Замороженная курица"
      },
      "category": "protein",
      "qty": 10,
      "unit": "lb",
      "lowAt": 5,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [],
      "sample": true
    },
    "s_lentils": {
      "names": {
        "en": "Lentils",
        "es": "Lentejas",
        "zh": "小扁豆",
        "ru": "Чечевица"
      },
      "category": "protein",
      "qty": 16,
      "unit": "bags",
      "lowAt": 5,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_bananas": {
      "names": {
        "en": "Bananas",
        "es": "Plátanos",
        "zh": "香蕉",
        "ru": "Бананы"
      },
      "category": "produce",
      "qty": 25,
      "unit": "lb",
      "lowAt": 8,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [],
      "diets": [
        "vegetarian",
        "vegan",
        "halal"
      ],
      "sample": true
    },
    "s_cereal": {
      "names": {
        "en": "Whole-grain cereal",
        "es": "Cereal integral",
        "zh": "全谷物麦片",
        "ru": "Цельнозерновые хлопья"
      },
      "category": "grains",
      "qty": 9,
      "unit": "boxes",
      "lowAt": 4,
      "pantryId": "p_uconnect",
      "createdAt": 1791166435825,
      "updatedAt": 1791166435825,
      "updatedBy": null,
      "allergens": [
        "gluten"
      ],
      "diets": [
        "vegetarian"
      ],
      "sample": true
    }
  }
};
