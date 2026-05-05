import { PermissionFlagsBits, type ButtonInteraction, type ChatInputCommandInteraction, type ModalSubmitInteraction } from "discord.js";

type TicketInteraction = ButtonInteraction | ChatInputCommandInteraction | ModalSubmitInteraction;

export function parseTicketRoleIds(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw.split(/[,\s]+/);
  }
}

export function hasTicketAdminPermission(interaction: TicketInteraction): boolean {
  const member = interaction.member as any;
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

export function hasTicketSupportRole(interaction: TicketInteraction, instance: any): boolean {
  const member = interaction.member as any;
  const roleIds = parseTicketRoleIds(instance?.config?.supportRoleIds).filter((id) => /^\d{15,25}$/.test(id));
  return roleIds.some((roleId) => member?.roles?.cache?.has?.(roleId) || member?.roles?.includes?.(roleId));
}

export function canManageTicket(interaction: TicketInteraction, instance: any): boolean {
  return hasTicketAdminPermission(interaction) || hasTicketSupportRole(interaction, instance);
}
