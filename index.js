const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot Discord actif 24/7 !\n');
});
server.listen(process.env.PORT || 3000, () => {
  console.log('Serveur web prêt pour garder le bot éveillé !');
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

const commandsList = [
    { name: 's?u', desc: 'Affiche tes stats ou celles d\'un membre (@membre)', category: '📊 Statistiques' },
    { name: 's?topmsg', desc: 'Affiche le classement du top 10 des messages', category: '📊 Statistiques' },
    { name: 's?topvoc', desc: 'Affiche le classement du top 10 du temps en vocal', category: '📊 Statistiques' },
    { name: '!ban', desc: 'Bannit un membre du serveur', category: '⚙️ Administration' },
    { name: '!warn', desc: 'Donne un avertissement à un membre', category: '⚙️ Administration' },
    { name: '!ticket-setup', desc: 'Envoie le panneau de création de tickets', category: '⚙️ Administration' },
    { name: '!roles-setup', desc: 'Envoie le menu de sélection des rôles', category: '⚙ Administration' },
    { name: '!help', desc: 'Affiche la liste d\'aide', category: '📌 Général' }
];

const userStats = {};
const voiceJoinTimes = {};
const userWarns = {}; // Stocke les warns sous la forme : { userId: [ { reason: "...", moderator: "..." } ] }


client.on('ready', () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
});

// =========================================================
// GESTION DES MESSAGES & COMMANDES
// =========================================================
client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    // Compteur de messages pour les stats
    if (!userStats[message.author.id]) {
        userStats[message.author.id] = { messages: 0, voiceTime: 0 };
    }
    userStats[message.author.id].messages += 1;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // Commande !help
    if (command === '!help') {
        const embedHelp = new EmbedBuilder()
            .setTitle('📜 Liste des commandes du bot')
            .setDescription('Voici toutes les commandes disponibles sur le bot Abyss :')
            .setColor('#5865F2')
            .addFields(
                { name: '🎟️ `!ticket-setup`', value: 'Affiche le panneau pour créer un ticket.' },
                { name: '🎨 `!roles-setup`', value: 'Affiche le menu déroulant des rôles de couleur.' },
                { name: '⚠️ `!warn @membre [raison]`', value: 'Avertit un membre du serveur.' },
                { name: '🔨 `!ban @membre [raison]`', value: 'Bannit un membre du serveur.' },
                { name: '❓ `!help`', value: 'Affiche cette liste d\'aide.' },
                { name: '📊 `s?u`', value: 'Affiche tes statistiques.' },
                { name: '🏆 `s?topmsg` / `s?topvoc`', value: 'Affiche les classements.' }
            )
            .setFooter({ text: 'Bot Abyss' });

        return message.channel.send({ embeds: [embedHelp] });
    }

    // Commande !ticket-setup
    if (command === '!ticket-setup') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('🎟️ Créer un ticket')
                .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
            .setTitle('🎟️ Support & Tickets')
            .setDescription('Besoin d\'aide ou d\'un contact avec la modération ? Clique sur le bouton ci-dessous pour ouvrir un ticket privé.')
            .setColor('#5865F2');

        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed], components: [row] });
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
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!warn @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';

        return message.channel.send(`⚠️ **${target}** a reçu un avertissement. Raison : ${reason}`);
    }

    // Statistiques : s?u
    if (command.startsWith('s?u')) {
        const target = message.mentions.members.first() || message.member;
        const stats = userStats[target.id] || { messages: 0, voiceTime: 0 };
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
    }

    // Statistiques : s?topmsg
    if (command === 's?topmsg') {
        const sorted = Object.entries(userStats)
            .sort(([, a], [, b]) => b.messages - a.messages)
            .slice(0, 10);

        if (sorted.length === 0) return message.channel.send('Aucune donnée enregistrée.');

        const leaderboard = sorted.map(([id, data], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
            return `${medal} <@${id}> — **${data.messages}** messages`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 10 — Messages')
            .setColor('#F1C40F')
            .setDescription(leaderboard);

        return message.channel.send({ embeds: [embed] });
    }

    // Statistiques : s?topvoc
    if (command === 's?topvoc') {
        const sorted = Object.entries(userStats)
            .sort(([, a], [, b]) => b.voiceTime - a.voiceTime)
            .slice(0, 10);

        if (sorted.length === 0) return message.channel.send('Aucune donnée enregistrée.');

        const leaderboard = sorted.map(([id, data], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**#${index + 1}**`;
            const hours = Math.floor(data.voiceTime / 60);
            const mins = data.voiceTime % 60;
            return `${medal} <@${id}> — **${hours}h ${mins}m** en vocal`;
        }).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('🎙️ Top 10 — Temps Vocal')
            .setColor('#3498DB')
            .setDescription(leaderboard);

        return message.channel.send({ embeds: [embed] });
    }
});

// =========================================================
// GESTION DES INTERACTIONS (BOUTONS & MENUS DE RÔLES)
// =========================================================
client.on('interactionCreate', async interaction => {
    // Bouton Ticket
    if (interaction.isButton() && interaction.customId === 'create_ticket') {
        const guild = interaction.guild;
        const channelName = `ticket-${interaction.user.username}`;

        if (guild.channels.cache.find(c => c.name === channelName)) {
            return interaction.reply({ content: 'Tu as déjà un ticket ouvert !', flags: 64 });
        }

        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: '1554974958692859956', allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
            ]
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('🔒 Fermer le ticket')
                .setStyle(ButtonStyle.Danger)
        );

        await channel.send({ 
            content: `Bonjour ${interaction.user}, un modérateur va prendre en charge ton ticket.`,
            components: [row]
        });
        
        return interaction.reply({ content: `Ticket créé : ${channel}`, flags: 64 });
    }

    // Bouton Fermeture de Ticket
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        const isOwner = interaction.user.id === TON_ID_DISCORD;
        const isMod = interaction.member.roles.cache.has('1554974958692859956');

        if (!isOwner && !isMod) {
            return interaction.reply({ content: "Tu n'as pas la permission de fermer ce ticket !", flags: 64 });
        }

        await interaction.reply({ content: 'Fermeture du ticket dans 3 secondes...' });
        setTimeout(async () => {
            await interaction.channel.delete().catch(() => {});
        }, 3000);
    }

    // Menu Couleurs
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
// SUIVI VOCAL (STATS VOCALES)
// =========================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.id || oldState.id;
    if (newState.member?.user.bot) return;

    if (!userStats[userId]) {
        userStats[userId] = { messages: 0, voiceTime: 0 };
    }

    if (!oldState.channelId && newState.channelId) {
        const channelName = newState.channel.name.toLowerCase();
        if (channelName.includes('ticket') || channelName.includes('privé') || channelName.includes('prive')) return;
        
        voiceJoinTimes[userId] = Date.now();
    }

    if (oldState.channelId && !newState.channelId) {
        if (voiceJoinTimes[userId]) {
            const minutes = Math.floor((Date.now() - voiceJoinTimes[userId]) / 60000);
            userStats[userId].voiceTime += minutes;
            delete voiceJoinTimes[userId];
        }
    }
});

// --- SYSTÈME DE BIENVENUE 100% BLEU AVEC GIF ANIMÉ BLEU ---
client.on('guildMemberAdd', async member => {
    // 💬 Remplace par l'ID exact de ton salon 💬chat
    const channelId = '1554966441462337608'; 
    const channel = member.guild.channels.cache.get(channelId);
    
    if (!channel) return;

    // Embed design aux couleurs bleues avec un GIF animé bleu esthétique
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#0099FF') // Bleu électrique intense
        .setTitle('💎 NOUVEAU MEMBRE ARRIVÉ ! 💎')
        .setDescription(`Bienvenue à toi, ${member}, sur **${member.guild.name}** !\n\n> 🌊 Installe-toi confortablement, va lire le règlement et passe un excellent moment avec nous.\n\n✦ **Rôle :** Membre\n✦ **Statut :** Prêt à naviguer 🚀`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setImage('https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHp1bmtpcTZibXp4aXZrdmEyd3g2aXJ3NXVrcmQydXlkeXlzZWNweiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/L1W07mO6r4b04/giphy.gif') // GIF animé bleu stylé
        .setFooter({ text: `Membre n°${member.guild.memberCount} • Abyss Security`, iconURL: member.guild.iconURL() })
        .setTimestamp();

    // Envoi du message stylé dans le salon
    await channel.send({ 
        content: `💙 Bienvenue sur le serveur, ${member} !`, 
        embeds: [welcomeEmbed] 
    });
});

    
// --- COMMANDE !DIRE ---
client.on('messageCreate', async message => {
    if (message.content.startsWith('!dire ')) {
        const texte = message.content.slice(6);
        await message.delete().catch(() => {});
        await message.channel.send(texte);
    }
});

// --- PIÈGE ANTI-BOT ---
const SALON_PIEGE_ID = '1555614017668775976';
const TON_ID_DISCORD = '1095675404859215902';

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.author.id === TON_ID_DISCORD) return;

    if (message.channel.id === SALON_PIEGE_ID) {
        try {
            await message.delete().catch(() => {});
            await message.guild.members.ban(message.author.id, { 
                reason: "Piège anti-bot : envoi de message dans un salon interdit." 
            });
        } catch (error) {
            console.error("Erreur de bannissement :", error);
        }
    }
});

// --- SYSTÈME DE POINTS ---
const points = {};

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!addonepoint')) {
        if (message.author.id !== TON_ID_DISCORD) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const target = message.mentions.users.first();
        if (!target) {
            return message.reply("Il faut mentionner quelqu'un ! Exemple : `!addonepoint @nom`");
        }

        if (!points[target.id]) {
            points[target.id] = 0;
        }

        points[target.id] += 1;
        message.channel.send(`✅ 1 point a été ajouté à ${target.username}. Total : **${points[target.id]} point(s)**.`);
    }

    if (message.content === '!point' || message.content.startsWith('!point ')) {
        const target = message.mentions.users.first() || message.author;
        const userPoints = points[target.id] || 0;
        
        message.channel.send(`🏆 ${target.username} a **${userPoints} point(s)**.`);
    }
});

// --- SYSTÈME DE BOOST DE SERVEUR ---
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // ID du rôle de boost sur ton serveur (remplace par le vrai ID du rôle)
    const roleBoostId = '1555194290106273832'; 

    // Vérifie si le membre vient de booster le serveur (passage de faux à vrai)
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const role = newMember.guild.roles.cache.get(roleBoostId);
        if (role) {
            await newMember.roles.add(role).catch(err => console.error("Erreur d'ajout de rôle boost :", err));
        }

        // Optionnel : Envoyer un message de remerciement dans un salon général
        const salonGeneral = newMember.guild.channels.cache.find(c => c.name === '💬chat');
        if (salonGeneral) {
            salonGeneral.send(`🎉 Merci infiniment pour le boost du serveur, ${newMember} ! T'assures grave 🚀`);
        }
    }
});
// --- SYSTÈME DE GESTION DES WARNS & SÉCURITÉ HIÉRARCHIQUE ---

// ID du rôle minimum requis (le rôle modérateur de base)
const ROLE_MOD_ID = '1554974958692859956'; 

// Fonction pour vérifier si l'utilisateur a le rôle requis ou un rôle au-dessus
function canUseModCommands(member) {
    // Si c'est toi le créateur, tu as toujours tous les droits
    if (member.id === TON_ID_DISCORD) return true;
    
    // Vérifie si le membre a les permissions administrateur
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;

    // Récupère le rôle de modération sur le serveur
    const modRole = member.guild.roles.cache.get(ROLE_MOD_ID);
    if (!modRole) return false;

    // Vérifie si le rôle du membre est plus haut ou égal au rôle modérateur dans la hiérarchie
    // (member.roles.highest compare la position automatique des rôles)
    return member.roles.highest.position >= modRole.position;
}

client.on('messageCreate', async message => {
    if (!message.guild || message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // 1. Commande !warn améliorée avec vérification du rôle ou supérieur
    if (command === '!warn') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande ! (Réservé aux modérateurs et rôles supérieurs).");
        }

        const target = message.mentions.members.first();
        if (!target) return message.reply('Utilisation : `!warn @membre [raison]`');
        const reason = args.slice(2).join(' ') || 'Aucune raison';

        if (!userWarns[target.id]) {
            userWarns[target.id] = [];
        }

        userWarns[target.id].push({ reason, moderator: message.author.tag });
        const totalWarns = userWarns[target.id].length;

        await message.channel.send(`⚠️ **${target}** a reçu un avertissement. (Total : **${totalWarns}/3**) \nRaison : ${reason}`);

        // Alerte à 3 warns avec boutons
        if (totalWarns >= 3) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ban_yes_${target.id}`)
                    .setLabel('🔨 Oui, bannir')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`ban_no_${target.id}`)
                    .setLabel('❌ Ignorer')
                    .setStyle(ButtonStyle.Secondary)
            );

            await message.channel.send({
                content: `<@${TON_ID_DISCORD}> 🚨 **Alerte modération** : ${target.user.tag} a atteint **${totalWarns} avertissements** ! Veux-tu le bannir ?`,
                components: [row]
            });
        }
    }

    // 2. Commande !listwarns
    if (command === '!listwarns') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const target = message.mentions.members.first() || message.member;
        const warns = userWarns[target.id] || [];

        if (warns.length === 0) {
            return message.channel.send(`✅ **${target.user.username}** n'a aucun avertissement.`);
        }

        const list = warns.map((w, index) => `**#${index + 1}** — Raison : *${w.reason}* (Par ${w.moderator})`).join('\n');
        
        const embedWarns = new EmbedBuilder()
            .setTitle(`📋 Avertissements de ${target.user.username}`)
            .setDescription(list)
            .setColor('#FFA500');

        return message.channel.send({ embeds: [embedWarns] });
    }

    // 3. Commande !delwarn
    if (command === '!delwarn') {
        if (!canUseModCommands(message.member)) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const target = message.mentions.members.first();
        const warnIndex = parseInt(args[2]) - 1;

        if (!target || isNaN(warnIndex)) {
            return message.reply('Utilisation : `!delwarn @membre [numéro du warn]` (Exemple: `!delwarn @Nom 1`)');
        }

        if (!userWarns[target.id] || !userWarns[target.id][warnIndex]) {
            return message.reply("❌ Ce numéro d'avertissement n'existe pas pour ce membre.");
        }

        userWarns[target.id].splice(warnIndex, 1);
        return message.channel.send(`✅ L'avertissement n°${warnIndex + 1} de **${target.user.username}** a été supprimé avec succès.`);
    }
});

// --- SYSTÈME ANTI-SPAM ---
const userSpamLog = {}; // Stocke l'historique des messages : { userId: [timestamp1, timestamp2, ...] }

client.on('messageCreate', async message => {
    // On ignore les bots, les messages hors serveur, et les modérateurs/toi
    if (!message.guild || message.author.bot) return;
    if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

    const userId = message.author.id;
    const now = Date.now();

    // Si l'utilisateur n'a pas d'historique, on lui en crée un
    if (!userSpamLog[userId]) {
        userSpamLog[userId] = [];
    }

    // On ajoute le message actuel avec l'heure précise
    userSpamLog[userId].push(now);

    // On ne garde que les messages envoyés au cours des 4 dernières secondes (4000 millisecondes)
    userSpamLog[userId] = userSpamLog[userId].filter(timestamp => now - timestamp < 4000);

    // Si l'utilisateur a envoyé 5 messages ou plus en moins de 4 secondes -> SPAM !
    if (userSpamLog[userId].length >= 5) {
        // On vide son historique pour éviter de le spam-punir en boucle
        userSpamLog[userId] = [];

        // 1. On supprime son message de spam
        await message.delete().catch(() => {});

        // 2. On lui envoie un avertissement dans le chat (qui s'efface au bout de 5 secondes)
        const warningMsg = await message.channel.send(`⚠️ ${message.author}, calme-toi sur le spam !`);
        setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

        // 3. Optionnel : Tu peux aussi lui mettre un warn automatique dans ton système de warn !
        // (Si tu veux qu'il prenne un warn direct, tu peux l'ajouter ici)
    }
});


// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
