import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
import mcDataLoader from 'minecraft-data';
import { Vec3 } from 'vec3';

const { pathfinder, Movements, goals } = pathfinderPkg;

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

    const loop = async () => {
      try {
        if (bot.food < 14) return await getFood();
        if (bot.inventory.count('oak_log') < 5 && bot.inventory.count('oak_planks') < 10) return await getWood();
        if (bot.inventory.count('cobblestone') < 20) return await mineStone();
        if (!hasTools()) return await craftTools();
        if (bot.inventory.items().length > 25) return await storeItems();
        if (bot.inventory.count('diamond') < 3) return await mineOres();
        return await buildHouse();
      } catch {}
    };
    setInterval(loop, 6000 + Math.random()*4000);

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
