const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');
const express = require('express');

// --- CONFIGURATION DU SERVEUR WEB POUR RENDER ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Abyss Bot est en ligne et actif 24/7 !');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Serveur web prêt et à l'écoute sur le port ${port}`);
});

// --- CONFIGURATION MONGODB ---
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db, messagesCollection, vocauxCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("AbyssBot");
        messagesCollection = db.collection("messages");
        vocauxCollection = db.collection("vocaux");
        console.log("✅ Connecté à MongoDB avec succès !");
    } catch (error) {
        console.error("❌ Erreur de connexion à MongoDB :", error);
    }
}
connectDB();
// Création des tables si elles n'existent pas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stats (
        userId TEXT PRIMARY KEY,
        messages INTEGER DEFAULT 0,
        voiceTime INTEGER DEFAULT 0,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS warns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        reason TEXT,
        moderator TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS points (
        userId TEXT PRIMARY KEY,
        points INTEGER DEFAULT 0
    )`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers
    ]
});

const voiceJoinTimes = {};
const userSpamLog = {}; 

const TON_ID_DISCORD = '1095675404859215902';
const ROLE_MOD_ID = '1554974958692859956';
const SALON_PIEGE_ID = '1555614017668775976';

function canUseModCommands(member) {
    if (member.id === TON_ID_DISCORD) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    const modRole = member.guild.roles.cache.get(ROLE_MOD_ID);
    if (!modRole) return false;
    return member.roles.highest.position >= modRole.position;
}

function getUserData(userId, callback) {
    db.get(`SELECT * FROM stats WHERE userId = ?`, [userId], (err, row) => {
        if (!row) {
            db.run(`INSERT INTO stats (userId, messages, voiceTime, xp, level) VALUES (?, 0, 0, 0, 1)`, [userId], () => {
                callback({ userId, messages: 0, voiceTime: 0, xp: 0, level: 1 });
            });
        } else {
            callback(row);
        }
    });
}

async function updateLevelRole(member, level) {
    const gradeRoles = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'La Fosse', 'Élite', 'Abysses'];
    
    let targetRoleName = 'Fer';
    if (level >= 10 && level < 30) targetRoleName = 'Bronze';
    else if (level >= 30 && level < 40) targetRoleName = 'Argent';
    else if (level >= 40 && level < 60) targetRoleName = 'Or';
    else if (level >= 60 && level < 80) targetRoleName = 'Platine';
    else if (level >= 80 && level < 100) targetRoleName = 'Diamant';
    else if (level >= 100 && level < 120) targetRoleName = 'La Fosse';
    else if (level >= 120 && level < 150) targetRoleName = 'Élite';
    else if (level >= 150) targetRoleName = 'Abysses';

    const roleToGive = member.guild.roles.cache.find(r => r.name === targetRoleName);
    if (!roleToGive) return;

    try {
        const rolesToRemove = member.roles.cache.filter(r => gradeRoles.includes(r.name) && r.name !== targetRoleName);
        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove);

        if (!member.roles.cache.has(roleToGive.id)) {
            await member.roles.add(roleToGive);
        }
    } catch (error) {
        console.log(`❌ ERREUR DISCORD lors de l'attribution du rôle :`, error);
    }
}

client.on('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

// =========================================================
// GESTION DES MESSAGES & COMMANDES TEXTUELLES
// =========================================================
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    // --- ANTI-SPAM ---
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const userId = message.author.id;
        const now = Date.now();
        if (!userSpamLog[userId]) userSpamLog[userId] = [];
        userSpamLog[userId].push(now);
        userSpamLog[userId] = userSpamLog[userId].filter(timestamp => now - timestamp < 4000);

        if (userSpamLog[userId].length >= 5) {
            userSpamLog[userId] = [];
            await message.delete().catch(() => {});
            const warningMsg = await message.channel.send(`⚠️ ${message.author}, calme-toi sur le spam !`);
            setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
            return;
        }
    }

    // --- PIÈGE ANTI-BOT ---
    if (message.channel.id === SALON_PIEGE_ID && message.author.id !== TON_ID_DISCORD) {
        try {
            await message.delete().catch(() => {});
            await message.guild.members.ban(message.author.id, { reason: "Piège anti-bot : envoi de message dans un salon interdit." });
        } catch (error) {
            console.error("Erreur de bannissement :", error);
        }
        return;
    }

    // Gestion base de données messages & XP
    getUserData(message.author.id, async (userData) => {
        let newMessages = userData.messages + 1;
        let newXp = userData.xp + (Math.floor(Math.random() * 3) + 2);
        let newLevel = userData.level;
        let xpNeeded = newLevel * newLevel * 50;

        if (newXp >= xpNeeded) {
            newXp -= xpNeeded;
            newLevel += 1;
            await updateLevelRole(message.member, newLevel);
            message.channel.send(`🎉 Félicitations ${message.author}, tu passes au **niveau ${newLevel}** ! 🚀`).catch(() => {});
        }

        db.run(`UPDATE stats SET messages = ?, xp = ?, level = ? WHERE userId = ?`, [newMessages, newXp, newLevel, message.author.id]);
    });

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // --- COMMANDE DE SYNCHRONISATION DE L'HISTORIQUE ---
    if (command === '!sync') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const loadingMsg = await message.channel.send("⏳ Analyse et comptage des messages du serveur en cours... Patiente un instant.");
        
        try {
            const channels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
            const messageCounts = {};

            for (const [channelId, channel] of channels) {
                let lastId = null;
                let fetched;
                do {
                    const options = { limit: 100 };
                    if (lastId) options.before = lastId;
                    fetched = await channel.messages.fetch(options).catch(() => null);
                    if (!fetched || fetched.size === 0) break;

                    fetched.forEach(msg => {
                        if (!msg.author.bot) {
                            messageCounts[msg.author.id] = (messageCounts[msg.author.id] || 0) + 1;
                        }
                    });

                    lastId = fetched.last().id;
                } while (fetched.size >= 100);
            }

            for (const [userId, count] of Object.entries(messageCounts)) {
                db.get(`SELECT messages FROM stats WHERE userId = ?`, [userId], (err, row) => {
                    if (!row) {
                        db.run(`INSERT INTO stats (userId, messages, voiceTime, xp, level) VALUES (?, ?, 0, 0, 1)`, [userId, count]);
                    } else {
                        db.run(`UPDATE stats SET messages = ? WHERE userId = ?`, [count, userId]);
                    }
                });
            }

            await loadingMsg.edit("✅ Synchronisation terminée avec succès ! Tous les anciens messages ont été comptés.");
        } catch (error) {
            console.error(error);
            await loadingMsg.edit("❌ Une erreur est survenue lors de la synchronisation.");
        }
        return;
    }

    // Commande !help
    if (command === '!help') {
        const embedHelp = new EmbedBuilder()
            .setTitle('📜 Liste des commandes du bot Abyss')
            .setDescription('Voici toutes les commandes et fonctionnalités disponibles :')
            .setColor('#0099FF')
            .addFields(
                { name: '🔄 `!sync`', value: 'Compte tous les messages de l\'historique du serveur.' },
                { name: '🎟️ `!ticket-setup`', value: 'Affiche le panneau pour créer un ticket.' },
                { name: '🎨 `!roles-setup`', value: 'Affiche le menu déroulant des rôles de couleur.' },
                { name: '⭐ `!level [@membre]`', value: 'Affiche ton niveau et ton XP.' },
                { name: '🛠️ `!setlevel @membre [niveau]`', value: 'Définit le niveau d\'un membre (Créateur).' },
                { name: '🧹 `!clear [nombre]`', value: 'Supprime un nombre de messages (Staff).' },
                { name: '⚠️ `!warn @membre [raison]`', value: 'Avertit un membre du serveur.' },
                { name: '📋 `!listwarns @membre`', value: 'Affiche les avertissements d\'un membre.' },
                { name: '🗑️ `!delwarn @membre [numéro]`', value: 'Supprime un avertissement.' },
                { name: '🔨 `!ban @membre [raison]`', value: 'Bannit un membre du serveur.' },
                { name: '📊 `s?u`', value: 'Affiche tes statistiques.' },
                { name: '🏆 `s?topmsg` / `s?topvoc`', value: 'Affiche les classements.' }
            )
            .setFooter({ text: 'Bot Abyss • Sécurité & Gestion' });
        return message.channel.send({ embeds: [embedHelp] });
    }

    // Commande !ticket-setup
    if (command === '!ticket-setup') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_ticket').setLabel('🎟️ Créer un ticket').setStyle(ButtonStyle.Primary)
        );
        const embed = new EmbedBuilder()
            .setTitle('🎟️ Support & Tickets')
            .setDescription('Besoin d\'aide ou d\'un contact avec la modération ? Clique sur le bouton ci-dessous pour ouvrir un ticket privé.')
            .setColor('#0099FF');
        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // Commande !roles-setup
    if (command === '!roles-setup') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_color_role')
                .setPlaceholder('🎨 Choisis ta couleur de rôle...')
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Bleu').setValue('Bleu').setDescription('Obtiens le rôle Bleu'),
                    new StringSelectMenuOptionBuilder().setLabel('Rouge').setValue('Rouge').setDescription('Obtiens le rôle Rouge'),
                    new StringSelectMenuOptionBuilder().setLabel('Vert').setValue('Vert').setDescription('Obtiens le rôle Vert'),
                    new StringSelectMenuOptionBuilder().setLabel('Violet').setValue('Violet').setDescription('Obtiens le rôle Violet'),
                    new StringSelectMenuOptionBuilder().setLabel('Rose').setValue('Rose').setDescription('Obtiens le rôle Rose')
                )
        );
        const embed = new EmbedBuilder()
            .setTitle('🎨 Choix de ton rôle couleur')
            .setDescription('Sélectionne une couleur dans le menu ci-dessous pour personnaliser ton profil sur le serveur !')
            .setColor('#0099FF');
        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // Commande !clear
    if (command === '!clear') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }
        const count = parseInt(args[1]);
        if (isNaN(count) || count < 1 || count > 100) {
            return message.reply("Précise un nombre de messages à supprimer entre 1 et 100 ! Exemple : `!clear 10`");
        }
        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(count, true);
            const confirmation = await message.channel.send(`🧹 **${deleted.size}** messages ont été supprimés avec succès !`);
            setTimeout(() => confirmation.delete().catch(() => {}), 4000);
        } catch (error) {
            return message.reply("Erreur : Je ne peux pas supprimer des messages de plus de 14 jours.");
        }
        return;
    }

    // Commande !ban
    if (command === '!ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!ban @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';
        await target.ban({ reason });
        return message.channel.send(`🔨 **${target.user.tag}** a été banni. Raison : ${reason}`);
    }

    // Commande !warn
    if (command === '!warn') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!warn @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';

        db.run(`INSERT INTO warns (userId, reason, moderator) VALUES (?, ?, ?)`, [target.id, reason, message.author.tag], () => {
            db.get(`SELECT COUNT(*) as count FROM warns WHERE userId = ?`, [target.id], async (err, row) => {
                const totalWarns = row.count;
                await message.channel.send(`⚠️ **${target}** a reçu un avertissement. (Total : **${totalWarns}/3**) \nRaison : ${reason}`);

                if (totalWarns >= 3) {
                    const rowAction = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ban_yes_${target.id}`).setLabel('🔨 Oui, bannir').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`ban_no_${target.id}`).setLabel('❌ Ignorer').setStyle(ButtonStyle.Secondary)
                    );
                    await message.channel.send({
                        content: `<@${TON_ID_DISCORD}> 🚨 **Alerte modération** : ${target.user.tag} a atteint **3 avertissements** ! Veux-tu le bannir ?`,
                        components: [rowAction]
                    });
                }
            });
        });
        return;
    }

    // Commande !listwarns
    if (command === '!listwarns') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first() || message.member;
        db.all(`SELECT * FROM warns WHERE userId = ?`, [target.id], (err, rows) => {
            if (!rows || rows.length === 0) return message.channel.send(`✅ **${target.user.username}** n'a aucun avertissement.`);
            const list = rows.map((w, index) => `**#${index + 1}** — Raison : *${w.reason}* (Par ${w.moderator})`).join('\n');
            const embedWarns = new EmbedBuilder().setTitle(`📋 Avertissements de ${target.user.username}`).setDescription(list).setColor('#FFA500');
            return message.channel.send({ embeds: [embedWarns] });
        });
        return;
    }

    // Commande !delwarn
    if (command === '!delwarn') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first();
        const warnIndex = parseInt(args[2]);
        if (!target || isNaN(warnIndex)) {
            return message.reply('Utilisation : `!delwarn @membre [numéro]`');
        }
        db.all(`SELECT id FROM warns WHERE userId = ?`, [target.id], (err, rows) => {
            if (!rows || !rows[warnIndex - 1]) return message.reply("Avertissement introuvable.");
            const warnIdToDelete = rows[warnIndex - 1].id;
            db.run(`DELETE FROM warns WHERE id = ?`, [warnIdToDelete], () => {
                return message.channel.send(`✅ L'avertissement n°${warnIndex} de **${target.user.username}** a été supprimé.`);
            });
        });
        return;
    }

    // Commande !dire
    if (command === '!dire') {
        const texte = message.content.slice(6);
        await message.delete().catch(() => {});
        return message.channel.send(texte);
    }

    // Système de niveaux (!level / !lvl)
    if (command === '!level' || command === '!lvl') {
        const target = message.mentions.members.first() || message.member;
        getUserData(target.id, (data) => {
            const needed = data.level * 100;
            const embedLevel = new EmbedBuilder()
                .setTitle(`⭐ Niveau de ${target.user.username}`)
                .setColor('#0099FF')
                .addFields(
                    { name: '📈 Niveau', value: `${data.level}`, inline: true },
                    { name: '✨ XP Actuel', value: `${data.xp} / ${needed} XP`, inline: true }
                )
                .setThumbnail(target.user.displayAvatarURL());
            return message.channel.send({ embeds: [embedLevel] });
        });
        return;
    }

    // Commande !setlevel
    if (command === '!setlevel') {
        if (message.author.id !== TON_ID_DISCORD) {
            return message.reply("Seul le créateur du bot peut utiliser cette commande !");
        }
        const target = message.mentions.members.first();
        const newLevel = parseInt(args[2]);

        if (!target || isNaN(newLevel) || newLevel < 1) {
            return message.reply("Utilisation correcte : `!setlevel @membre [niveau]` (Exemple : `!setlevel @Modo 45`)");
        }

        getUserData(target.id, async () => {
            db.run(`UPDATE stats SET level = ?, xp = 0 WHERE userId = ?`, [newLevel, target.id], async () => {
                await updateLevelRole(target, newLevel);
                return message.channel.send(`⭐ Bravo ${target} ! Ton niveau a été défini au **niveau ${newLevel}** par le créateur et ton rôle de grade a été mis à jour ! 🚀`);
            });
        });
        return;
    }

    // Statistiques : s?u
    if (command.startsWith('s?u')) {
        const target = message.mentions.members.first() || message.member;
        getUserData(target.id, (stats) => {
            const hours = Math.floor(stats.voiceTime / 60);
            const mins = stats.voiceTime % 60;

            const embedStats = new EmbedBuilder()
                .setTitle(`📊 Statistiques de ${target.user.username}`)
                .setColor('#00FF7F')
                .addFields(
                    { name: '💬 Messages envoyés', value: `${stats.messages}`, inline: true },
                    { name: '🎙️ Temps en vocal', value: `${hours}h ${mins}m`, inline: true }
                )
                .setThumbnail(target.user.displayAvatarURL());
            return message.channel.send({ embeds: [embedStats] });
        });
        return;
    }

    if (command === 's?topmsg') {
        db.all(`SELECT userId, messages FROM stats ORDER BY messages DESC LIMIT 10`, [], (err, rows) => {
            if (!rows || rows.length === 0) return message.channel.send('Aucune donnée.');
            const leaderboard = rows.map((data, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${data.messages}** msgs`).join('\n');
            const embed = new EmbedBuilder().setTitle('🏆 Top 10 — Messages').setColor('#F1C40F').setDescription(leaderboard);
            return message.channel.send({ embeds: [embed] });
        });
        return;
    }

    if (command === 's?topvoc') {
        db.all(`SELECT userId, voiceTime FROM stats ORDER BY voiceTime DESC LIMIT 10`, [], (err, rows) => {
            if (!rows || rows.length === 0) return message.channel.send('Aucune donnée.');
            const leaderboard = rows.map((data, i) => {
                const h = Math.floor(data.voiceTime / 60), m = data.voiceTime % 60;
                return `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${h}h ${m}m**`;
            }).join('\n');
            const embed = new EmbedBuilder().setTitle('🎙️ Top 10 — Temps Vocal').setColor('#3498DB').setDescription(leaderboard);
            return message.channel.send({ embeds: [embed] });
        });
        return;
    }
});

// =========================================================
// GESTION DES INTERACTIONS (BOUTONS & MENUS)
// =========================================================
client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && (interaction.customId.startsWith('ban_yes_') || interaction.customId.startsWith('ban_no_'))) {
        if (interaction.user.id !== TON_ID_DISCORD) {
            return interaction.reply({ content: "Seul le créateur du bot peut utiliser ces boutons !", flags: 64 });
        }
        const targetId = interaction.customId.split('_')[2];
        if (interaction.customId.startsWith('ban_yes_')) {
            try {
                await interaction.guild.members.ban(targetId, { reason: "Atteint 3 avertissements." });
                await interaction.update({ content: `🔨 Le membre a été banni avec succès.`, components: [] });
            } catch (err) {
                await interaction.reply({ content: "Erreur lors du bannissement du membre.", flags: 64 });
            }
        } else {
            await interaction.update({ content: `❌ Alerte ignorée.`, components: [] });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'create_ticket') {
        const guild = interaction.guild;
        const channelName = `ticket-${interaction.user.username}`.toLowerCase();

        if (guild.channels.cache.find(c => c.name === channelName)) {
            return interaction.reply({ content: 'Tu as déjà un ticket ouvert !', flags: 64 });
        }

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: ROLE_MOD_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer le ticket').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `Bonjour ${interaction.user}, un modérateur va prendre en charge ton ticket.`, components: [row] });
        return interaction.reply({ content: `Ticket créé : ${channel}`, flags: 64 });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const isOwner = interaction.user.id === TON_ID_DISCORD;
        const isMod = interaction.member.roles.cache.has(ROLE_MOD_ID);

        if (!isOwner && !isMod) {
            return interaction.reply({ content: "Tu n'as pas la permission de fermer ce ticket !", flags: 64 });
        }

        await interaction.reply({ content: 'Fermeture du ticket dans 3 secondes...' });
        setTimeout(async () => {
            await interaction.channel.delete().catch(() => {});
        }, 3000);
        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_color_role') {
        await interaction.deferReply({ flags: 64 });

        const selectedRoleName = interaction.values[0];
        const role = interaction.guild.roles.cache.find(r => r.name === selectedRoleName);

        if (!role) {
            return interaction.editReply({ content: `Le rôle **${selectedRoleName}** n'existe pas sur le serveur. Crée-le dans Discord !` });
        }

        const member = interaction.member;
        const colorRoles = ['Rose', 'Bleu', 'Rouge', 'Vert', 'Violet'];

        const rolesToRemove = member.roles.cache.filter(r => colorRoles.includes(r.name));
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove).catch(() => {});
        }

        try {
            await member.roles.add(role);
            return interaction.editReply({ content: `Tu as bien reçu le rôle **${role.name}** !` });
        } catch (error) {
            return interaction.editReply({ content: `Erreur : Vérifie que le rôle d'Abyss est AU-DESSUS du rôle **${role.name}** dans les paramètres Discord !` });
        }
    }
});

// =========================================================
// SUIVI VOCAL & ÉVÉNEMENTS MEMBRES
// =========================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.id || oldState.id;
    if (newState.member?.user.bot) return;

    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes[userId] = Date.now();
    }
    if (oldState.channelId && !newState.channelId) {
        if (voiceJoinTimes[userId]) {
            const minutes = Math.floor((Date.now() - voiceJoinTimes[userId]) / 60000);
            delete voiceJoinTimes[userId];

            if (minutes > 0) {
                getUserData(userId, (stats) => {
                    const newVoiceTime = stats.voiceTime + minutes;
                    db.run(`UPDATE stats SET voiceTime = ? WHERE userId = ?`, [newVoiceTime, userId]);
                });
            }
        }
    }
});

// Accueil Nouveau Membre
client.on('guildMemberAdd', async member => {
    const channelId = '1554966441462337608'; 
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('💎 NOUVEAU MEMBRE ARRIVÉ ! 💎')
        .setDescription(`Bienvenue à toi, ${member}, sur **${member.guild.name}** !\n\n> 🌊 Installe-toi confortablement, va lire le règlement et passe un excellent moment parmi nous.\n\n✦ **Rôle :** Membre\n✦ **Statut :** Prêt à naviguer 🚀`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setImage('https://cdn.discordapp.com/attachments/1517488205694369864/1556273762876391554/surprise-girl.gif')
        .setFooter({ text: `Membre n°${member.guild.memberCount} • Abyss Security`, iconURL: member.guild.iconURL() })
        .setTimestamp();

    await channel.send({ content: `💙 Bienvenue sur le serveur, ${member} !`, embeds: [welcomeEmbed] });
});

// Rôle de Boost auto
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const roleBoostId = '1555194290106273832'; 
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const role = newMember.guild.roles.cache.get(roleBoostId);
        if (role) await newMember.roles.add(role).catch(() => {});
        const salonGeneral = newMember.guild.channels.cache.find(c => c.name.includes('chat'));
        if (salonGeneral) salonGeneral.send(`🎉 Merci infiniment pour le boost du serveur, ${newMember} ! T'assures grave 🚀`);
    }
});

client.login(process.env.DISCORD_TOKEN);
