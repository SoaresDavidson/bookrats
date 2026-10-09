import { SignOut } from "@phosphor-icons/react";

export function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="flex items-center justify-center gap-2 mt-8 mx-auto min-h-11 px-5 bg-transparent text-muted border border-track rounded-control text-sm font-medium cursor-pointer [transition:color_.15s_ease,border-color_.15s_ease,transform_.1s_ease] hover:text-ink hover:border-ink active:scale-98 motion-reduce:transition-none motion-reduce:active:scale-100"
      onClick={onClick}
    >
      <SignOut size={18} weight="regular" aria-hidden="true" />
      Sair
    </button>
  );
}
