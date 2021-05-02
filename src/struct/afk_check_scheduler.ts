import { Message, TextChannel, GuildMember } from 'discord.js';
import AFKChecker, { AFKCheckData } from './afk_checker';
import sendmessage from '../util/sendmessage';
import type ChannelMonitor from './channel_monitor';
import type FCFSClient from '../fcfsclient';

export default class AFKCheckScheduler {
  private client: FCFSClient;

  private channelMonitor: ChannelMonitor;

  private _interval: number;

  public get interval(): number {
    return this._interval;
  }

  // eslint-disable-next-line no-undef
  private startTimeout: NodeJS.Timer | null = null;

  // eslint-disable-next-line no-undef
  private intervalTimer: NodeJS.Timer | null = null;

  constructor(client: FCFSClient, channelMonitor: ChannelMonitor, interval: number) {
    this.client = client;
    this.channelMonitor = channelMonitor;
    this._interval = interval;
  }

  public async run() {
    try {
      const guild = this.client.guilds.resolve(this.channelMonitor.guildID);
      if (!guild) return;
      const server = this.client.dataSource.servers[guild.id];
      const outputChannel: TextChannel = <TextChannel> guild.channels.resolve(this.channelMonitor.autoOutput!);
      if (!outputChannel) return;

      if (!this.channelMonitor.queue.length) return;

      const update = (message: Message, data: AFKCheckData) => {
        let text = 'Auto AFK-checking...\n\n';
        // eslint-disable-next-line max-len
        if (data.recentlyChecked) text += `${data.recentlyChecked} member(s) were recently afk-checked and were skipped over\n`;
        // eslint-disable-next-line max-len
        if (data.notInVC) text += `${data.notInVC} member(s) were not actually in the voice channel and were skipped over\n`;
        if (data.notAFK) text += `${data.notAFK} member(s) reacted to the message in time\n`;
        if (data.afk) text += `${data.afk} member(s) were booted from the queue\n`;

        message.edit(text).catch((err) => console.log(`Failed to update in auto check!\n${err.message}`));
      };

      const finalize = (message: Message, data: AFKCheckData) => {
        let text = 'Auto AFK-checking complete!\n\n';
        // eslint-disable-next-line max-len
        if (data.recentlyChecked) text += `${data.recentlyChecked} member(s) were recently afk-checked and were skipped over\n`;
        // eslint-disable-next-line max-len
        if (data.notInVC) text += `${data.notInVC} member(s) were not actually in the voice channel and were skipped over\n`;
        if (data.notAFK) text += `${data.notAFK} member(s) reacted to the message in time\n`;
        if (data.afk) text += `${data.afk} member(s) were booted from the queue\n`;

        message.edit(text).catch((err) => console.log(`Failed to finalize in auto check!\n${err.message}`));
      };

      const resultsMessage = await sendmessage(outputChannel, 'Auto AFK-checking...');
      if (!(resultsMessage instanceof Message)) return;

      const top: Array<GuildMember> = this.channelMonitor.queue
        .slice(0, this.channelMonitor.displaySize)
        .map((user) => guild.members.cache.get(user.id))
        .filter((value): value is GuildMember => value !== undefined);

      if (!top) return;

      const afkChecker = new AFKChecker(this.client, server, this.channelMonitor, top);

      afkChecker.on('update', (data) => {
        update(resultsMessage, data);
      });

      const results = await afkChecker.run();
      finalize(resultsMessage, results);
      afkChecker.removeAllListeners('update');
    } catch (err) {
      console.error(err);
    }
  }

  public start(): number {
    if (this.startTimeout) clearTimeout(this.startTimeout);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.interval === -1) return -1;
    const timeUntilNext = this.interval - (Date.now() % this.interval);
    this.startTimeout = setTimeout(() => {
      this.run();
      this.intervalTimer = setInterval(() => {
        this.run();
      }, this.interval);
    }, timeUntilNext);

    return timeUntilNext;
  }

  public changeInterval(interval: number) {
    this._interval = interval;
    return this.start();
  }
}