import {
  Collection,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SharedNameAndDescription,
} from "discord.js";

interface Command {
  data: SharedNameAndDescription & { toJSON(): unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();

export function registerCommand(command: Command): void {
  commands.set(command.data.name, command);
}

export async function handleInteraction(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;
  await command.execute(interaction);
}

export async function deployCommands(): Promise<void> {
  const rest = new REST().setToken(process.env.TOKEN!);
  const body = commands.map((cmd) => cmd.data.toJSON());

  if (process.env.SERVER_ID) {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.APPLICATION_ID!,
        process.env.SERVER_ID,
      ),
      { body },
    );
  } else {
    await rest.put(
      Routes.applicationCommands(process.env.APPLICATION_ID!),
      { body },
    );
  }
}

export { commands };
