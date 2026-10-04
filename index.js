const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { MongoClient } = require('mongodb');
const express = require('express');

// ID du salon pour les boosts
const BOOST_CHANNEL_ID = "1554966441462337608";

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
const mongoClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true
});

let db, statsCollection, warnsCollection;

async function connectDB() {
    try {
        await mongoClient.connect();
        db = mongoClient.db("AbyssBot");
        statsCollection = db.collection("stats");
        warnsCollection = db.collection("warns");
        console.log("✅ Connecté à MongoDB avec succès !");
    } catch (error) {
        console.error("❌ Erreur de connexion à MongoDB :", error);
    }
}
connectDB();

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

async function getUserData(userId) {
    let userDoc = await statsCollection.findOne({ userId });
    if (!userDoc) {
        userDoc = { userId, messages: 0, voiceTime: 0, xp: 0, level: 1 };
        await statsCollection.insertOne(userDoc);
    }
    return userDoc;
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
            const warningMsg = await message.channel.send(`⚠ ${message.author}, calme-toi sur le spam !`);
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

    const userData = await getUserData(message.author.id);
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

    await statsCollection.updateOne(
        { userId: message.author.id },
        { $set: { messages: newMessages, xp: newXp, level: newLevel } },
        { upsert: true }
    );

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // --- COMMANDE !sync ---
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
                await statsCollection.updateOne(
                    { userId },
                    { $set: { messages: count } },
                    { upsert: true }
                );
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
            .setDescription('Voici toutes les commandes et fonctionnalités disponibles sur le bot :')
            .setColor('#0099FF')
            .addFields(
                { name: '🔄 `!sync`', value: 'Compte et synchronise tous les messages de l\'historique du serveur.' },
                { name: '🎟️ `!ticket-setup`', value: 'Affiche le panneau interactif pour créer un ticket de support.' },
                { name: '🎨 `!roles-setup`', value: 'Affiche le menu déroulant pour choisir sa couleur de rôle.' },
                { name: '⭐ `!level [@membre]`', value: 'Affiche ton niveau actuel, ta progression et ton XP.' },
                { name: '🛠️ `!setlevel @membre [niveau]`', value: 'Définit manuellement le niveau d\'un membre.' },
                { name: '🧹 `!clear [nombre]`', value: 'Supprime un nombre précis de messages (Staff).' },
                { name: '⚠️ `!warn @membre [raison]`', value: 'Avertit un membre.' },
                { name: '📋 `!listwarns @membre`', value: 'Affiche la liste des avertissements.' },
                { name: '🗑 `!delwarn @membre [numéro]`', value: 'Supprime un avertissement.' },
                { name: '🔨 `!ban @membre [raison]`', value: 'Bannit un membre.' },
                { name: '🗣️ `!dire [texte]`', value: 'Fait dire un message au bot.' },
                { name: '📊 `s?u [@membre]`', value: 'Affiche tes statistiques détaillées.' },
                { name: '🏆 `s?topmsg`', value: 'Classement des messages.' },
                { name: '🎙️ `s?topvoc`', value: 'Classement du temps vocal.' }
            )
            .setFooter({ text: 'Bot Abyss • Système complet de gestion et sécurité' });
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
            .setTitle('🎟️ Support & Tickets Abyss')
            .setDescription('Besoin d\'aide ? Clique sur le bouton ci-dessous pour ouvrir un salon de ticket privé.')
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
                .setPlaceholder('🎨 Choisis ta couleur de profil...')
                .addOptions([
                    { label: 'Bleu', value: 'Bleu', description: 'Obtiens le rôle couleur Bleu' },
                    { label: 'Rouge', value: 'Rouge', description: 'Obtiens le rôle couleur Rouge' },
                    { label: 'Vert', value: 'Vert', description: 'Obtiens le rôle couleur Vert' },
                    { label: 'Violet', value: 'Violet', description: 'Obtiens le rôle couleur Violet' },
                    { label: 'Rose', value: 'Rose', description: 'Obtiens le rôle couleur Rose' }
                ])
        );
        const embed = new EmbedBuilder()
            .setTitle('🎨 Choix de ton rôle couleur personnalisé')
            .setDescription('Sélectionne une couleur dans le menu déroulant ci-dessous !')
            .setColor('#0099FF');
        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed], components: [row] });
    }

    // Commande !clear
    if (command === '!clear') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const count = parseInt(args[1]);
        if (isNaN(count) || count < 1 || count > 100) return message.reply("Précise un nombre entre 1 et 100 !");
        try {
            await message.delete().catch(() => {});
            const deleted = await message.channel.bulkDelete(count, true);
            const confirmation = await message.channel.send(`🧹 **${deleted.size}** messages nettoyés !`);
            setTimeout(() => confirmation.delete().catch(() => {}), 4000);
        } catch (error) {
            return message.reply("Erreur : Impossible de supprimer des messages de plus de 14 jours.");
        }
        return;
    }

    // Commande !ban
    if (command === '!ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!ban @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';
        try {
            await target.ban({ reason });
            return message.channel.send(`🔨 **${target.user.tag}** a été banni. Raison : *${reason}*`);
        } catch (error) {
            return message.reply("Je n'ai pas pu bannir ce membre.");
        }
    }

    // Commande !warn
    if (command === '!warn') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!warn @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';

        await warnsCollection.insertOne({ userId: target.id, reason, moderator: message.author.tag, date: new Date() });
        const totalWarns = await warnsCollection.countDocuments({ userId: target.id });

        await message.channel.send(`⚠️ **${target}** a reçu un avertissement (**${totalWarns}/3**). Raison : *${reason}*`);

        if (totalWarns >= 3) {
            const rowAction = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ban_yes_${target.id}`).setLabel('🔨 Oui, bannir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_no_${target.id}`).setLabel('❌ Ignorer').setStyle(ButtonStyle.Secondary)
            );
            await message.channel.send({
                content: `<@${TON_ID_DISCORD}> 🚨 **Alerte** : ${target.user.tag} a atteint 3 warns !`,
                components: [rowAction]
            });
        }
        return;
    }

    // Commande !listwarns
    if (command === '!listwarns') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first() || message.member;
        const rows = await warnsCollection.find({ userId: target.id }).toArray();
        if (!rows || rows.length === 0) return message.channel.send(`✅ **${target.user.username}** a un casier vierge.`);
        const list = rows.map((w, index) => `**#${index + 1}** — Raison : *${w.reason}*`).join('\n');
        const embedWarns = new EmbedBuilder().setTitle(`📋 Avertissements de ${target.user.username}`).setDescription(list).setColor('#FFA500');
        return message.channel.send({ embeds: [embedWarns] });
    }

    // Commande !delwarn
    if (command === '!delwarn') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first();
        const warnIndex = parseInt(args[2]);
        if (!target || isNaN(warnIndex)) return message.reply('Utilisation : `!delwarn @membre [numéro]`');
        const rows = await warnsCollection.find({ userId: target.id }).toArray();
        if (!rows || !rows[warnIndex - 1]) return message.reply("Avertissement introuvable.");
        
        await warnsCollection.deleteOne({ _id: rows[warnIndex - 1]._id });
        return message.channel.send(`✅ Avertissement n°${warnIndex} supprimé pour **${target.user.username}**.`);
    }

    // Commande !dire
    if (command === '!dire') {
        const texte = message.content.slice(6);
        await message.delete().catch(() => {});
        return message.channel.send(texte);
    }

    // Commande !level
    if (command === '!level' || command === '!lvl') {
        const target = message.mentions.members.first() || message.member;
        const data = await getUserData(target.id);
        const needed = data.level * data.level * 50;
        const embedLevel = new EmbedBuilder()
            .setTitle(`⭐ Niveau de ${target.user.username}`)
            .setColor('#0099FF')
            .addFields(
                { name: '📈 Niveau', value: `${data.level}`, inline: true },
                { name: '✨ XP', value: `${data.xp} / ${needed} XP`, inline: true }
            )
            .setThumbnail(target.user.displayAvatarURL());
        return message.channel.send({ embeds: [embedLevel] });
    }

    // Commande !setlevel
    if (command === '!setlevel') {
        if (message.author.id !== TON_ID_DISCORD) return message.reply("Seul le créateur peut faire ça !");
        const target = message.mentions.members.first();
        const newLevel = parseInt(args[2]);
        if (!target || isNaN(newLevel) || newLevel < 1) return message.reply("Utilisation : `!setlevel @membre [niveau]`");

        await statsCollection.updateOne({ userId: target.id }, { $set: { level: newLevel, xp: 0 } }, { upsert: true });
        await updateLevelRole(target, newLevel);
        return message.channel.send(`⭐ Niveau de ${target} défini à **${newLevel}** !`);
    }

    // Statistiques : s?u
    if (command.startsWith('s?u')) {
        const target = message.mentions.members.first() || message.member;
        const stats = await getUserData(target.id);
        const totalMinutes = stats.voiceTime || 0;
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;

        const embedStats = new EmbedBuilder()
            .setTitle(`📊 Statistiques de ${target.user.username}`)
            .setColor('#00FF7F')
            .addFields(
                { name: '💬 Messages', value: `${stats.messages}`, inline: true },
                { name: '🎙️ Temps vocal', value: `${hours}h ${mins}m`, inline: true }
            )
            .setThumbnail(target.user.displayAvatarURL());
        return message.channel.send({ embeds: [embedStats] });
    }

    if (command === 's?topmsg') {
        const rows = await statsCollection.find().sort({ messages: -1 }).limit(10).toArray();
        if (!rows || rows.length === 0) return message.channel.send('Aucune donnée.');
        const leaderboard = rows.map((data, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${data.messages}** messages`).join('\n');
        const embed = new EmbedBuilder().setTitle('🏆 Top 10 — Messages').setColor('#F1C40F').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 's?topvoc') {
        const rows = await statsCollection.find().sort({ voiceTime: -1 }).limit(10).toArray();
        if (!rows || rows.length === 0) return message.channel.send('Aucune donnée.');
        const leaderboard = rows.map((data, i) => {
            const h = Math.floor(data.voiceTime / 60), m = data.voiceTime % 60;
            return `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${h}h ${m}m**`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('🎙️ Top 10 — Temps Vocal').setColor('#3498DB').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }
});

// =========================================================
// GESTION DES INTERACTIONS (BOUTONS & MENUS)
// =========================================================
client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && (interaction.customId.startsWith('ban_yes_') || interaction.customId.startsWith('ban_no_'))) {
        if (interaction.user.id !== TON_ID_DISCORD) return interaction.reply({ content: "Réservé au créateur !", flags: 64 });
        const targetId = interaction.customId.split('_')[2];
        if (interaction.customId.startsWith('ban_yes_')) {
            try {
                await interaction.guild.members.ban(targetId, { reason: "Atteint 3 avertissements." });
                await interaction.update({ content: `🔨 Membre banni.`, components: [] });
            } catch (err) {
                await interaction.reply({ content: "Erreur de bannissement.", flags: 64 });
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

        await channel.send({ content: `Bonjour ${interaction.user}, un modérateur va t'aider.`, components: [row] });
        return interaction.reply({ content: `Ticket créé : ${channel}`, flags: 64 });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const isOwner = interaction.user.id === TON_ID_DISCORD;
        const isMod = interaction.member.roles.cache.has(ROLE_MOD_ID);

        if (!isOwner && !isMod) return interaction.reply({ content: "Pas la permission !", flags: 64 });

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

        if (!role) return interaction.editReply({ content: `Le rôle ${selectedRoleName} n'existe pas.` });

        const member = interaction.member;
        const colorRoles = ['Rose', 'Bleu', 'Rouge', 'Vert', 'Violet'];
        const rolesToRemove = member.roles.cache.filter(r => colorRoles.includes(r.name));
        if (rolesToRemove.size > 0) await member.roles.remove(rolesToRemove).catch(() => {});

        try {
            await member.roles.add(role);
            return interaction.editReply({ content: `Rôle **${role.name}** attribué !` });
        } catch (error) {
            return interaction.editReply({ content: `Erreur : Vérifie la hiérarchie des rôles du bot.` });
        }
    }
});

// =========================================================
// SUIVI VOCAL
// =========================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const now = Date.now();

    // Rejoint un salon vocal
    if (!oldState.channelId && newState.channelId) {
        voiceJoinTimes[userId] = now;
    }
    // Quitte un salon vocal
    else if (oldState.channelId && !newState.channelId) {
        if (voiceJoinTimes[userId]) {
            const minutes = Math.floor((now - voiceJoinTimes[userId]) / 60000);
            delete voiceJoinTimes[userId];

            if (minutes > 0 && statsCollection) {
                try {
                    await statsCollection.updateOne(
                        { userId },
                        { $inc: { voiceTime: minutes } },
                        { upsert: true }
                    );
                    console.log(`⏱️ ${member.user.tag} a passé ${minutes} minutes en voc.`);
                } catch (error) {
                    console.error("Erreur sauvegarde vocal :", error);
                }
            }
        }
    }
});

// =========================================================
// ARRIVÉE DES MEMBRES & BOOSTS
// =========================================================
client.on('guildMemberAdd', async member => {
    const channelId = '1554966441462337608'; 
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('💎 NOUVEAU MEMBRE ARRIVÉ ! 💎')
        .setDescription(`Bienvenue à toi, ${member}, sur **${member.guild.name}** !`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setTimestamp();

    await channel.send({ content: `💙 Bienvenue sur le serveur, ${member} !`, embeds: [welcomeEmbed] });
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const roleBoostId = '1555194290106273832'; 
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;

    if (!oldBoost && newBoost) {
        const role = newMember.guild.roles.cache.get(roleBoostId);
        if (role) await newMember.roles.add(role).catch(() => {});

        const channel = newMember.guild.channels.cache.get(BOOST_CHANNEL_ID);
        if (channel) {
            channel.send(`🎉 Merci infiniment pour le boost du serveur, ${newMember} ! T'assures grave 🚀`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
