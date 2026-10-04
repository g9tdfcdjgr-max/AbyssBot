const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

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

const userStats = {};
const voiceJoinTimes = {};
const userWarns = {}; // { userId: [ { reason: "...", moderator: "..." } ] }
const points = {};
const userSpamLog = {};
const userXp = {}; // { userId: { xp: 0, level: 1 } }

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

    // Compteur de messages & Système d'XP / Niveaux automatique
    if (!userStats[message.author.id]) {
        userStats[message.author.id] = { messages: 0, voiceTime: 0 };
    }
    userStats[message.author.id].messages += 1;

    if (!userXp[message.author.id]) {
        userXp[message.author.id] = { xp: 0, level: 1 };
    }
    const userData = userXp[message.author.id];
    userData.xp += Math.floor(Math.random() * 10) + 15; // Gagne entre 15 et 25 XP par message
    const xpNeeded = userData.level * 100;
    if (userData.xp >= xpNeeded) {
        userData.xp -= xpNeeded;
        userData.level += 1;
        message.channel.send(`🎉 Félicitations ${message.author}, tu passes au **niveau ${userData.level}** ! 🚀`).catch(() => {});
    }

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();

    // Commande !help
    if (command === '!help') {
        const embedHelp = new EmbedBuilder()
            .setTitle('📜 Liste des commandes du bot Abyss')
            .setDescription('Voici toutes les commandes et fonctionnalités disponibles :')
            .setColor('#0099FF')
            .addFields(
                { name: '🎟️ `!ticket-setup`', value: 'Affiche le panneau pour créer un ticket.' },
                { name: '🎨 `!roles-setup`', value: 'Affiche le menu déroulant des rôles de couleur.' },
                { name: '⭐ `!level [@membre]`', value: 'Affiche ton niveau ou celui d\'un membre.' },
                { name: '🛠️ `!setlevel @membre [niveau]`', value: 'Définit le niveau d\'un membre (Créateur).' },
                { name: '🧹 `!clear [nombre]`', value: 'Supprime un nombre de messages (Staff).' },
                { name: '⚠️ `!warn @membre [raison]`', value: 'Avertit un membre du serveur.' },
                { name: '📋 `!listwarns @membre`', value: 'Affiche les avertissements d\'un membre.' },
                { name: '🗑️️ `!delwarn @membre [numéro]`', value: 'Supprime un avertissement.' },
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

    // Commande !clear (Purge de messages)
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

        if (!userWarns[target.id]) userWarns[target.id] = [];
        userWarns[target.id].push({ reason, moderator: message.author.tag });
        const totalWarns = userWarns[target.id].length;

        await message.channel.send(`⚠️️ **${target}** a reçu un avertissement. (Total : **${totalWarns}/3**) \nRaison : ${reason}`);

        if (totalWarns >= 3) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ban_yes_${target.id}`).setLabel('🔨 Oui, bannir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`ban_no_${target.id}`).setLabel('❌ Ignorer').setStyle(ButtonStyle.Secondary)
            );
            await message.channel.send({
                content: `<@${TON_ID_DISCORD}> 🚨 **Alerte modération** : ${target.user.tag} a atteint **3 avertissements** ! Veux-tu le bannir ?`,
                components: [row]
            });
        }
        return;
    }

    // Commande !listwarns
    if (command === '!listwarns') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first() || message.member;
        const warns = userWarns[target.id] || [];
        if (warns.length === 0) return message.channel.send(`✅ **${target.user.username}** n'a aucun avertissement.`);

        const list = warns.map((w, index) => `**#${index + 1}** — Raison : *${w.reason}* (Par ${w.moderator})`).join('\n');
        const embedWarns = new EmbedBuilder().setTitle(`📋 Avertissements de ${target.user.username}`).setDescription(list).setColor('#FFA500');
        return message.channel.send({ embeds: [embedWarns] });
    }

    // Commande !delwarn
    if (command === '!delwarn') {
        if (!canUseModCommands(message.member)) return message.reply("Tu n'as pas la permission !");
        const target = message.mentions.members.first();
        const warnIndex = parseInt(args[2]) - 1;
        if (!target || isNaN(warnIndex) || !userWarns[target.id] || !userWarns[target.id][warnIndex]) {
            return message.reply('Utilisation : `!delwarn @membre [numéro]`');
        }
        userWarns[target.id].splice(warnIndex, 1);
        return message.channel.send(`✅ L'avertissement n°${warnIndex + 1} de **${target.user.username}** a été supprimé.`);
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
        if (!userXp[target.id]) userXp[target.id] = { xp: 0, level: 1 };
        const data = userXp[target.id];
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
    }

    // Commande !setlevel (Réservé au créateur du bot pour féliciter / donner des niveaux aux modos)
    if (command === '!setlevel') {
        if (message.author.id !== TON_ID_DISCORD) {
            return message.reply("Seul le créateur du bot peut utiliser cette commande !");
        }
        const target = message.mentions.members.first();
        const newLevel = parseInt(args[2]);

        if (!target || isNaN(newLevel) || newLevel < 1) {
            return message.reply("Utilisation correcte : `!setlevel @membre [niveau]` (Exemple : `!setlevel @Modo 5`)");
        }

        if (!userXp[target.id]) userXp[target.id] = { xp: 0, level: 1 };
        userXp[target.id].level = newLevel;
        userXp[target.id].xp = 0; // Remet l'XP du palier à 0 proprement

        return message.channel.send(`⭐ Bravo ${target} ! Ton niveau a été défini directement au **niveau ${newLevel}** par le créateur ! 🚀`);
    }

    // Système de points
    if (command === '!addonepoint') {
        if (message.author.id !== TON_ID_DISCORD) return message.reply("Permissions insuffisantes.");
        const target = message.mentions.users.first();
        if (!target) return message.reply("Mentionne quelqu'un !");
        if (!points[target.id]) points[target.id] = 0;
        points[target.id] += 1;
        return message.channel.send(`✅ 1 point ajouté à ${target.username}. Total : **${points[target.id]} point(s)**.`);
    }

    if (command === '!point') {
        const target = message.mentions.users.first() || message.author;
        return message.channel.send(`🏆 ${target.username} a **${points[target.id] || 0} point(s)**.`);
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

    if (command === 's?topmsg') {
        const sorted = Object.entries(userStats).sort(([, a], [, b]) => b.messages - a.messages).slice(0, 10);
        if (sorted.length === 0) return message.channel.send('Aucune donnée.');
        const leaderboard = sorted.map(([id, data], i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${id}> — **${data.messages}** msgs`).join('\n');
        const embed = new EmbedBuilder().setTitle('🏆 Top 10 — Messages').setColor('#F1C40F').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 's?topvoc') {
        const sorted = Object.entries(userStats).sort(([, a], [, b]) => b.voiceTime - a.voiceTime).slice(0, 10);
        if (sorted.length === 0) return message.channel.send('Aucune donnée.');
        const leaderboard = sorted.map(([id, data], i) => {
            const h = Math.floor(data.voiceTime / 60), m = data.voiceTime % 60;
            return `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} <@${id}> — **${h}h ${m}m**`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('🎙️ Top 10 — Temps Vocal').setColor('#3498DB').setDescription(leaderboard);
        return message.channel.send({ embeds: [embed] });
    }
});

// =========================================================
// GESTION DES INTERACTIONS (BOUTONS & MENUS)
// =========================================================
client.on('interactionCreate', async interaction => {
    // Boutons de Warn (Ban / Ignorer)
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

    // Bouton Ticket
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

    // Fermeture de Ticket
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

    // Menu Déroulant des Rôles de Couleur
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

    if (!userStats[userId]) userStats[userId] = { messages: 0, voiceTime: 0 };

    if (!oldState.channelId && newState.channelId) {
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

// Accueil Nouveau Membre (100% Bleu avec GIF)
client.on('guildMemberAdd', async member => {
    const channelId = '1554966441462337608'; 
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    const welcomeEmbed = new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('💎 NOUVEAU MEMBRE ARRIVÉ ! 💎')
        .setDescription(`Bienvenue à toi, ${member}, sur **${member.guild.name}** !\n\n> 🌊 Installe-toi confortablement, va lire le règlement et passe un excellent moment parmi nous.\n\n✦ **Rôle :** Membre\n✦ **Statut :** Prêt à naviguer 🚀`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setImage('https://cdn.discordapp.com/attachments/1517488205694369864/1556267670213758996/image.png?backend=b2&ex=6ac38ab6&is=6ac23936&hm=86358401616f24db66c9f82a0b2af215a0ccd9fcbf2706f77e724887306e5c3a&')
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
