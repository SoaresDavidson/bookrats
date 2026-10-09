import { SignOut } from "@phosphor-icons/react";

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="logout" onClick={onClick}>
      <SignOut size={18} weight="regular" aria-hidden="true" />
      Sair
    </button>
  );
}
