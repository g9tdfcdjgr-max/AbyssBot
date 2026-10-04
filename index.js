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
// --- CONFIGURATION MONGODB ---
const uri = process.env.MONGO_URI;
const mongoClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true // Contourne temporairement le blocage SSL de Render
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

// Déclaration unique de l'instance client Discord (C'est ICI qu'était l'erreur)
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

    // Gestion base de données messages & XP
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
                { name: '🔄 `!sync`', value: 'Compte et synchronise tous les messages de l\'historique du serveur dans la base de données.' },
                { name: '🎟️ `!ticket-setup`', value: 'Affiche le panneau interactif pour créer un ticket de support.' },
                { name: '🎨 `!roles-setup`', value: 'Affiche le menu déroulant pour choisir sa couleur de rôle.' },
                { name: '⭐ `!level [@membre]`', value: 'Affiche ton niveau actuel, ta progression et ton XP.' },
                { name: '🛠️ `!setlevel @membre [niveau]`', value: 'Définit manuellement le niveau d\'un membre (Réservé au Créateur).' },
                { name: '🧹 `!clear [nombre]`', value: 'Supprime un nombre précis de messages entre 1 et 100 (Staff).' },
                { name: '⚠️ `!warn @membre [raison]`', value: 'Avertit un membre (bannissement automatique ou alerte au 3ème warn).' },
                { name: '📋 `!listwarns @membre`', value: 'Affiche la liste complète des avertissements d\'un membre.' },
                { name: '🗑 `!delwarn @membre [numéro]`', value: 'Supprime un avertissement spécifique d\'un membre.' },
                { name: '🔨 `!ban @membre [raison]`', value: 'Bannit un membre du serveur (Modération).' },
                { name: '🗣️ `!dire [texte]`', value: 'Fait dire un message au bot en supprimant ta commande.' },
                { name: '📊 `s?u [@membre]`', value: 'Affiche tes statistiques détaillées (messages et temps vocal).' },
                { name: '🏆 `s?topmsg`', value: 'Affiche le classement des membres les plus actifs par message.' },
                { name: '🎙️ `s?topvoc`', value: 'Affiche le classement des membres ayant passé le plus de temps en vocal.' }
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
            .setDescription('Besoin d\'aide, d\'une assistance ou d\'un contact direct avec la modération ? Clique sur le bouton ci-dessous pour ouvrir un salon de ticket privé et sécurisé.')
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
                .addOptions(
                    new StringSelectMenuOptionBuilder().setLabel('Bleu').setValue('Bleu').setDescription('Obtiens le rôle couleur Bleu'),
                    new StringSelectMenuOptionBuilder().setLabel('Rouge').setValue('Rouge').setDescription('Obtiens le rôle couleur Rouge'),
                    new StringSelectMenuOptionBuilder().setLabel('Vert').setValue('Vert').setDescription('Obtiens le rôle couleur Vert'),
                    new StringSelectMenuOptionBuilder().setLabel('Violet').setValue('Violet').setDescription('Obtiens le rôle couleur Violet'),
                    new StringSelectMenuOptionBuilder().setLabel('Rose').setValue('Rose').setDescription('Obtiens le rôle couleur Rose')
                )
        );
        const embed = new EmbedBuilder()
            .setTitle('🎨 Choix de ton rôle couleur personnalisé')
            .setDescription('Sélectionne une couleur dans le menu déroulant ci-dessous pour changer l\'apparence de ton pseudo sur le serveur !')
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
            const confirmation = await message.channel.send(`🧹 **${deleted.size}** messages ont été nettoyés avec succès !`);
            setTimeout(() => confirmation.delete().catch(() => {}), 4000);
        } catch (error) {
            return message.reply("Erreur : Je ne peux pas supprimer des messages de plus de 14 jours en raison des limitations de l'API Discord.");
        }
        return;
    }

    // Commande !ban
    if (command === '!ban') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation correcte : `!ban @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison spécifiée';
        try {
            await target.ban({ reason });
            return message.channel.send(`🔨 **${target.user.tag}** a été banni du serveur. Raison : *${reason}*`);
        } catch (error) {
            return message.reply("Je n'ai pas pu bannir ce membre (vérifie ma position dans la liste des rôles).");
        }
    }

    // Commande !warn
    if (command === '!warn') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation correcte : `!warn @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison spécifiée';

        await warnsCollection.insertOne({ userId: target.id, reason, moderator: message.author.tag, date: new Date() });
        const totalWarns = await warnsCollection.countDocuments({ userId: target.id });

        await message.channel.send(`⚠️ **${target}** a reçu un avertissement de la part de **${message.author.tag}**. (Total : **${totalWarns}/3**) \nRaison : *${reason}*`);

        if (totalWarns >= 3) {
            const rowAction = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ban_yes_${target.id}`).setLabel('🔨 Oui, bannir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_no_${target.id}`).setLabel('❌ Ignorer').setStyle(ButtonStyle.Secondary)
            );
            await message.channel.send({
                content: `<@${TON_ID_DISCORD}> 🚨 **Alerte de sécurité** : ${target.user.tag} a atteint ou dépassé **3 avertissements** ! Veux-tu procéder à son bannissement ?`,
                components: [rowAction]
            });
        }
        return;
    }

    // Commande !listwarns
    if (command === '!listwarns') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        const target = message.mentions.members.first() || message.member;
        const rows = await warnsCollection.find({ userId: target.id }).toArray();
        
        if (!rows || rows.length === 0) return message.channel.send(`✅ **${target.user.username}** possède un casier vierge (aucun avertissement).`);
        const list = rows.map((w, index) => `**#${index + 1}** — Raison : *${w.reason}* (Ajouté par ${w.moderator})`).join('\n');
        const embedWarns = new EmbedBuilder().setTitle(`📋 Avertissements de ${target.user.username}`).setDescription(list).setColor('#FFA500');
        return message.channel.send({ embeds: [embedWarns] });
    }

    // Commande !delwarn
    if (command === '!delwarn') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        const target = message.mentions.members.first();
        const warnIndex = parseInt(args[2]);
        if (!target || isNaN(warnIndex)) {
            return message.reply('Utilisation correcte : `!delwarn @membre [numéro]`');
        }
        const rows = await warnsCollection.find({ userId: target.id }).toArray();
        if (!rows || !rows[warnIndex - 1]) return message.reply("Avertissement introuvable avec ce numéro.");
        
        const warnToDelete = rows[warnIndex - 1];
        await warnsCollection.deleteOne({ _id: warnToDelete._id });
        return message.channel.send(`✅ L'avertissement n°${warnIndex} concernant **${target.user.username}** a été supprimé avec succès.`);
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
        const data = await getUserData(target.id);
        const needed = data.level * data.level * 50;
        const embedLevel = new EmbedBuilder()
            .setTitle(`⭐ Niveau et Progression de ${target.user.username}`)
            .setColor('#0099FF')
            .addFields(
                { name: '📈 Niveau Actuel', value: `${data.level}`, inline: true },
                { name: '✨ Expérience (XP)', value: `${data.xp} / ${needed} XP`, inline: true }
            )
            .setThumbnail(target.user.displayAvatarURL());
        return message.channel.send({ embeds: [embedLevel] });
    }

    // Commande !setlevel
    if (command === '!setlevel') {
        if (message.author.id !== TON_ID_DISCORD) {
            return message.reply("Seul le créateur du bot possède les droits pour utiliser cette commande !");
        }
        const target = message.mentions.members.first();
        const newLevel = parseInt(args[2]);

        if (!target || isNaN(newLevel) || newLevel < 1) {
            return message.reply("Utilisation correcte : `!setlevel @membre [niveau]` (Exemple : `!setlevel @Membre 45`)");
        }

        await statsCollection.updateOne(
            { userId: target.id },
            { $set: { level: newLevel, xp: 0 } },
            { upsert: true }
        );
        await updateLevelRole(target, newLevel);
        return message.channel.send(`⭐ Succès ! Le niveau de ${target} a été défini au **niveau ${newLevel}** par le créateur et son rôle de grade a été actualisé ! 🚀`);
    }

    // Statistiques : s?u
    if (command.startsWith('s?u')) {
        const target = message.mentions.members.first() || message.member;
        const stats = await getUserData(target.id);
        const hours = Math.floor(stats.voiceTime / 60);
        const mins = stats.voiceTime % 60;

        const embedStats = new EmbedBuilder()
            .setTitle(`📊 Statistiques détaillées de ${target.user.username}`)
            .setColor('#00FF7F')
            .addFields(
                { name: '💬 Messages envoyés', value: `${stats.messages}`, inline: true },
                { name: '🎙️ Temps total en vocal', value: `${hours}h ${mins}m`, inline: true }
            )
            .setThumbnail(target.user.displayAvatarURL());
        return message.channel.send({ embeds: [embedStats] });
    }

    if (command === 's?topmsg') {
        const rows = await statsCollection.find().sort({ messages: -1 }).limit(10).toArray();
        if (!rows || rows.length === 0) return message.channel.send('Aucune donnée enregistrée pour le moment.');
        const leaderboard = rows.map((data, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${data.messages}** messages`).join('\n');
        const embed = new EmbedBuilder().setTitle('🏆 Top 10 — Messages du serveur').setColor('#F1C40F').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 's?topvoc') {
        const rows = await statsCollection.find().sort({ voiceTime: -1 }).limit(10).toArray();
        if (!rows || rows.length === 0) return message.channel.send('Aucune donnée enregistrée pour le moment.');
        const leaderboard = rows.map((data, i) => {
            const h = Math.floor(data.voiceTime / 60), m = data.voiceTime % 60;
            return `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${data.userId}> — **${h}h ${m}m** en vocal`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('🎙️ Top 10 — Temps Vocal du serveur').setColor('#3498DB').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }
});

// =========================================================
// GESTION DES INTERACTIONS (BOUTONS & MENUS)
// =========================================================
client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && (interaction.customId.startsWith('ban_yes_') || interaction.customId.startsWith('ban_no_'))) {
        if (interaction.user.id !== TON_ID_DISCORD) {
            return interaction.reply({ content: "Seul le créateur du bot peut interagir avec ces boutons de sanction !", flags: 64 });
        }
        const targetId = interaction.customId.split('_')[2];
        if (interaction.customId.startsWith('ban_yes_')) {
            try {
                await interaction.guild.members.ban(targetId, { reason: "Atteint la limite de 3 avertissements." });
                await interaction.update({ content: `🔨 Le membre a été banni avec succès suite aux alertes.`, components: [] });
            } catch (err) {
                await interaction.reply({ content: "Erreur : Impossible de bannir ce membre.", flags: 64 });
            }
        } else {
            await interaction.update({ content: `❌ Alerte de sanction ignorée par le créateur.`, components: [] });
        }
        return;
    }

    if (interaction.isButton() && interaction.customId === 'create_ticket') {
        const guild = interaction.guild;
        const channelName = `ticket-${interaction.user.username}`.toLowerCase();

        if (guild.channels.cache.find(c => c.name === channelName)) {
            return interaction.reply({ content: 'Tu possèdes déjà un ticket de support ouvert sur le serveur !', flags: 64 });
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

        await channel.send({ content: `Bonjour ${interaction.user}, un membre de l'équipe de modération va bientôt prendre en charge ton ticket.`, components: [row] });
        return interaction.reply({ content: `Votre ticket a été créé avec succès : ${channel}`, flags: 64 });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const isOwner = interaction.user.id === TON_ID_DISCORD;
        const isMod = interaction.member.roles.cache.has(ROLE_MOD_ID);

        if (!isOwner && !isMod) {
            return interaction.reply({ content: "Tu n'as pas la permission de fermer ce ticket de support !", flags: 64 });
        }

        await interaction.reply({ content: 'Fermeture et suppression du salon de ticket en cours (dans 3 secondes)...' });
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
            return interaction.editReply({ content: `Le rôle **${selectedRoleName}** n'existe pas encore sur ce serveur. Demande à un administrateur de le créer !` });
        }

        const member = interaction.member;
        const colorRoles = ['Rose', 'Bleu', 'Rouge', 'Vert', 'Violet'];

        const rolesToRemove = member.roles.cache.filter(r => colorRoles.includes(r.name));
        if (rolesToRemove.size > 0) {
            await member.roles.remove(rolesToRemove).catch(() => {});
        }

        try {
            await member.roles.add(role);
            return interaction.editReply({ content: `Félicitations, tu hast reçu le rôle couleur **${role.name}** !` });
        } catch (error) {
            return interaction.editReply({ content: `Erreur : Assure-toi que le rôle du bot Abyss est placé AU-DESSUS des rôles de couleur dans les paramètres Discord !` });
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
                const stats = await getUserData(userId);
                const newVoiceTime = stats.voiceTime + minutes;
                await statsCollection.updateOne(
                    { userId },
                    { $set: { voiceTime: newVoiceTime } },
                    { upsert: true }
                );
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
        .setDescription(`Bienvenue à toi, ${member}, sur **${member.guild.name}** !\n\n> 🌊 Installe-toi confortablement, va lire le règlement et passe un excellent moment parmi nous.\n\n✦ **Rôle par défaut :** Membre\n✦ **Statut :** Prêt à naviguer 🚀`)
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
// --- SYSTÈME DE COMPTEUR DE VOCAL ---
const activeVoiceSessions = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const userId = member.id;
    const now = Date.now();

    // Cas 1 : L'utilisateur rejoint un salon vocal
    if (!oldState.channelId && newState.channelId) {
        activeVoiceSessions.set(userId, now);
    }
    
    // Cas 2 : L'utilisateur quitte un salon vocal
    else if (oldState.channelId && !newState.channelId) {
        const joinTime = activeVoiceSessions.get(userId);
        if (joinTime) {
            const timeSpentInSeconds = Math.floor((now - joinTime) / 1000);
            activeVoiceSessions.delete(userId);

            if (timeSpentInSeconds > 0 && statsCollection) {
                try {
                    // Sauvegarde ou mise à jour dans MongoDB
                    await statsCollection.updateOne(
                        { userId: userId },
                        { $inc: { voiceTime: timeSpentInSeconds } },
                        { upsert: true }
                    );
                    console.log(`⏱️ ${member.user.tag} a passé ${timeSpentInSeconds} secondes en voc.`);
                } catch (error) {
                    console.error("Erreur lors de la sauvegarde du temps vocal :", error);
                }
            }
        }
    }
});
client.login(process.env.DISCORD_TOKEN);
