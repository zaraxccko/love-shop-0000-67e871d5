// ============================================================
// 🔐 Тонкая обёртка над session — роли определяются только сервером.
// Реальная авторизация: src/store/session.ts (через Telegram initData).
// ============================================================
import { useSession } from "./session";

export const useAuth = () => {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const isAdmin = !!user?.isAdmin;
  const isModerator = !!user?.isModerator;

  return {
    isAdmin,
    isModerator,
    /** Заглушка для совместимости со старым кодом. Реальный вход — через session.loginWithInitData. */
    loginWithTelegram: (_tgId?: number | null) => isAdmin,
    logout,
  };
};
