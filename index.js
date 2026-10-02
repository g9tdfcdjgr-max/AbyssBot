const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
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
    { name: '!roles-setup', desc: 'Envoie le menu de sélection des rôles', category: '⚙️️ Administration' },
    { name: '!help', desc: 'Affiche la liste d\'aide', category: '📌 Général' }
];

const userStats = {};
const voiceJoinTimes = {};

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
                { id: '1554974958692859956', allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        await channel.send(`Bonjour ${interaction.user}, un modérateur va prendre en charge ton ticket.`);
        return interaction.reply({ content: `Ticket créé : ${channel}`, flags: 64 });
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
// =========================================================
// MESSAGE DE BIENVENUE EN EMBED ROSE
// =========================================================
client.on('guildMemberAdd', async member => {
    const channelName = '💬chat'; 
    const welcomeChannel = member.guild.channels.cache.find(c => c.name === channelName);

    if (!welcomeChannel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setTitle('✨ Nouveau membre !')
        .setDescription(`👋 Bienvenue sur le serveur, ${member} ! On est ravis de t'compter parmi nous.`)
        .setColor('#FF69B4') // Rose
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();

    await welcomeChannel.send({ embeds: [welcomeEmbed] });
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
const TON_ID_DISCORD = '1095675404859215902'; // Ton propre ID pour ne pas te faire bannir

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Si c'est toi qui écris dans le salon piège, on ne fait rien (tu peux poster tes règles tranquille)
    if (message.author.id === TON_ID_DISCORD) return;

    if (message.channel.id === SALON_PIEGE_ID) {
        try {
            await message.delete().catch(() => {});
            await message.guild.members.ban(message.author.id, { 
                reason: "Piège anti-bot : envoi de message dans un salon interdit." 
            });
            console.log(`[PIÈGE] ${message.author.tag} a été banni.`);
        } catch (error) {
            console.error("Erreur de bannissement :", error);
        }
    }
});
// --- SYSTÈME DE POINTS ---
const points = {}; // Mémoire pour stocker les points

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // Commande : !addonepoint @utilisateur (Réservé au créateur ou admins)
    if (message.content.startsWith('!addonepoint')) {
        // Optionnel : vérifier si c'est bien toi (avec ton ID) qui fais la commande
        if (message.author.id !== TON_ID_DISCORD) {
            return message.reply("Tu n'as pas la permission d'utiliser cette commande !");
        }

        const target = message.mentions.users.first();
        if (!target) {
            return message.reply("Il faut mentionner quelqu'un ! Exemple : `!addonepoint @nom`");
        }

        // Initialise les points si l'utilisateur n'en a pas encore
        if (!points[target.id]) {
            points[target.id] = 0;
        }

        points[target.id] += 1;
        message.channel.send(`✅ 1 point a été ajouté à ${target.username}. Total : **${points[target.id]} point(s)**.`);
    }

    // Commande : !point (Pour voir ses propres points ou ceux d'un autre)
    if (message.content === '!point' || message.content.startsWith('!point ')) {
        const target = message.mentions.users.first() || message.author;
        const userPoints = points[target.id] || 0;
        
        message.channel.send(`🏆 ${target.username} a **${userPoints} point(s)**.`);
    }
});
// --- ANTI-TEXTE SALON MÉDIA ---
const SALON_MEDIA_ID = '1554964028600877166'; // Remplace par l'ID de ton salon média
let consecutiveTextMessages = []; // Tableau pour stocker les messages textuels d'affilée

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    if (message.channel.id !== SALON_MEDIA_ID) return;

    // Vérifie si le message contient un média (image, vidéo, fichier ou lien direct)
    const hasMedia = message.attachments.size > 0 || message.content.includes('http://') || message.content.includes('https://');

    if (hasMedia) {
        // Si quelqu'un poste un média, on remet le compteur à zéro
        consecutiveTextMessages = [];
    } else {
        // Si c'est juste du texte sans média, on l'ajoute à la liste
        consecutiveTextMessages.push(message);

        // Si on dépasse 10 messages textuels d'affilée
        if (consecutiveTextMessages.length > 10) {
            // Récupère les auteurs uniques pour les avertir
            const authorsToWarn = [...new Set(consecutiveTextMessages.map(m => m.author))];
            
            // Supprime tous les messages textuels accumulés
            for (let msg of consecutiveTextMessages) {
                await msg.delete().catch(() => {});
            }

            // Envoie un avertissement dans le salon
            const mentions = authorsToWarn.map(u => `<@${u.id}>`).join(', ');
            const warningMsg = await message.channel.send(`⚠️ ${mentions}, ce salon est réservé aux médias ! Plus de 10 messages textuels d'affilée ont été supprimés.`);
            
            // Supprime l'avertissement du bot après 5 secondes pour garder le salon propre
            setTimeout(() => warningMsg.delete().catch(() => {}), 5000);

            // Réinitialise le compteur
            consecutiveTextMessages = [];
        }
    }
});



// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
