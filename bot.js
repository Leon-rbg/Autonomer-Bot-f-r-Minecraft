const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const mcDataLoader = require('minecraft-data');
const { Vec3 } = require('vec3');

const NAMES = ['Aldor', 'Borin', 'Cora', 'Darius', 'Elya'];
const HOST = process.env.HOST || 'localhost';
const PORT = Number(process.env.PORT || 25565);
const VERSION = process.env.VERSION || '1.20.1';

let STORAGE_POS = null;

function createBot(name, id) {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: name,
    version: VERSION,
    auth: 'offline'
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[${name}] Online auf ${HOST}:${PORT}`);
    const mcData = mcDataLoader(bot.version);
    bot.pathfinder.setMovements(new Movements(bot, mcData));
    if (!STORAGE_POS) STORAGE_POS = bot.entity.position.floored();

    setInterval(async () => {
      try {
        if (bot.food < 14) return await getFood();
        if (bot.inventory.count('oak_log') < 5) return await getWood();
        if (bot.inventory.count('cobblestone') < 20) return await mineStone();
        if (!hasTools()) return await craftTools();
        if (bot.inventory.items().length > 25) return await storeItems();
        if (bot.inventory.count('diamond') < 3) return await mineOres();
        return await buildHouse();
      } catch {}
    }, 7000);

    async function getWood() {
      const block = bot.findBlock({ matching: b => b.name.includes('_log'), maxDistance: 80 });
      if (!block) return;
      await goto(block.position);
      await bot.dig(block);
    }

    async function getFood() {
      const mcData = mcDataLoader(bot.version);
      const wheats = bot.findBlocks({ matching: mcData.blocksByName.wheat.id, maxDistance: 32, count: 10 });
      for (const p of wheats) {
        const b = bot.blockAt(p);
        if (b && b.metadata === 7) { await goto(b.position); await bot.dig(b); }
      }
      const food = bot.inventory.items().find(i => i.name.includes('bread') || i.name.includes('potato'));
      if (food) { try { await bot.equip(food, 'hand'); await bot.consume(); } catch {} }
    }

    function hasTools() { return bot.inventory.items().some(i => i.name.includes('pickaxe')); }

    async function craftTools() {
      const mcData = mcDataLoader(bot.version);
      let table = bot.findBlock({ matching: mcData.blocksByName.crafting_table.id, maxDistance: 16 });
      if (!table) {
        const planksRecipe = bot.recipesFor(mcData.itemsByName.oak_planks.id, null, 1, bot.inventory)[0];
        if (bot.inventory.count('oak_log') > 0 && planksRecipe) { try { await bot.craft(planksRecipe, 1, null); } catch {} return; }
        const tableRecipe = bot.recipesFor(mcData.itemsByName.crafting_table.id, null, 1, null)[0];
        if (tableRecipe) {
          try {
            await bot.craft(tableRecipe, 1, null);
            const ref = bot.blockAt(bot.entity.position.floored().offset(0,-1,0));
            if (ref) await bot.placeBlock(ref, new Vec3(0,1,0));
          } catch {}
        }
        return;
      }
      await goto(table.position);
      const pick = bot.recipesFor(mcData.itemsByName.wooden_pickaxe.id, null, 1, table)[0];
      if (pick) try { await bot.craft(pick, 1, table); } catch {}
    }

    async function mineStone() {
      const mcData = mcDataLoader(bot.version);
      const stone = bot.findBlock({ matching: mcData.blocksByName.stone.id, maxDistance: 12 });
      if (stone) { await goto(stone.position); await bot.dig(stone); }
    }

    async function mineOres() {
      const mcData = mcDataLoader(bot.version);
      if (bot.entity.position.y > 25) { try { await bot.pathfinder.goto(new goals.GoalY(11)); } catch {} return; }
      const ids = [mcData.blocksByName.diamond_ore?.id, mcData.blocksByName.iron_ore.id, mcData.blocksByName.coal_ore.id].filter(Boolean);
      const ore = bot.findBlock({ matching: ids, maxDistance: 24 });
      if (ore) { await goto(ore.position); await bot.dig(ore); }
    }

    async function storeItems() {
      if (!STORAGE_POS) return;
      await goto(STORAGE_POS);
      const mcData = mcDataLoader(bot.version);
      let chest = bot.findBlock({ matching: mcData.blocksByName.chest.id, maxDistance: 8 });
      if (!chest) {
        const item = bot.inventory.items().find(i => i.name === 'chest');
        if (item) {
          try {
            const ref = bot.blockAt(STORAGE_POS.offset(0,-1,0));
            await bot.equip(item, 'hand');
            await bot.placeBlock(ref, new Vec3(0,1,0));
          } catch {}
        }
        return;
      }
      try {
        const win = await bot.openChest(bot.blockAt(chest.position));
        for (const it of bot.inventory.items()) {
          if (it.name.includes('pickaxe') || it.name.includes('axe')) continue;
          try { await win.deposit(it.type, null, it.count); } catch {}
        }
        win.close();
      } catch {}
    }

    async function buildHouse() {
      if (bot.inventory.count('cobblestone') < 30) return;
      const base = STORAGE_POS.offset(id*6, 0, 10);
      for (let x=0;x<4;x++) {
        for (let z=0;z<4;z++) {
          if (x===0||x===3||z===0||z===3) {
            try {
              const ref = bot.blockAt(base.offset(x,-1,z));
              const mat = bot.inventory.items().find(i => i.name==='cobblestone');
              if (mat && ref) { await goto(base.offset(x,0,z)); await bot.equip(mat,'hand'); await bot.placeBlock(ref, new Vec3(0,1,0)); }
            } catch {}
          }
        }
      }
    }

    async function goto(pos) { try { await bot.pathfinder.goto(new goals.GoalNear(pos.x,pos.y,pos.z,1)); } catch {} }
  });

  bot.on('end', () => setTimeout(() => createBot(name, id), 15000));
}

NAMES.forEach((n,i) => setTimeout(()=>createBot(n,i), i*3000));
console.log('Starte 5 Bots...');
