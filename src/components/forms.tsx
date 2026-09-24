"use client";
import { useActionState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { mutateAction } from "@/app/actions";
import { kinds } from "@/lib/validation";
import type { User } from "@/lib/data";
export function ActionForm({
  operation,
  children,
  label = "Save",
  className = "",
}: {
  operation: string;
  children?: React.ReactNode;
  label?: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState(mutateAction, {
    ok: false,
    message: "",
  });
  return (
    <form action={action} className={`action-form ${className}`}>
      <input type="hidden" name="operation" value={operation} />
      {children}
      <button className="button" disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      {state.message && (
        <p role="status" className={state.ok ? "success" : "error"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
export function AddHackathon({ users, me }: { users: User[]; me: User }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="button">
        <Plus size={16} /> Add hackathon
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-head">
            <div>
              <p className="eyebrow">MAKE ROOM FOR YOUR NEXT BIG IDEA</p>
              <Dialog.Title>Add a hackathon</Dialog.Title>
            </div>
            <Dialog.Close aria-label="Close" className="icon-button">
              <X />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            Add your team and the dates you know. We’ll take care of the
            reminders.
          </Dialog.Description>
          <ActionForm operation="create" label="Create hackathon">
            <label>
              Hackathon name
              <input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. ABC Hackathon"
              />
            </label>
            <label>
              Organizer
              <input
                name="organizer"
                required
                maxLength={120}
                placeholder="Who’s hosting?"
              />
            </label>
            <label>
              Timezone
              <input name="timezone" defaultValue="Asia/Kolkata" required />
            </label>
            <fieldset>
              <legend>Always included</legend>
              <div className="chips">
                {users
                  .filter(
                    (u) => u.active && (u.global_member || u.id === me.id),
                  )
                  .map((u) => (
                    <span className="chip" key={u.id}>
                      {u.name}{" "}
                      <small>{u.id === me.id ? "You" : "Global"}</small>
                    </span>
                  ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Add existing members</legend>
              {users
                .filter((u) => u.active && !u.global_member && u.id !== me.id)
                .map((u) => (
                  <label className="check" key={u.id}>
                    <input type="checkbox" name="members" value={u.id} />
                    {u.name}
                    <small>{u.role}</small>
                  </label>
                ))}
            </fieldset>
            <fieldset>
              <legend>
                Deadlines <span className="muted">· all optional</span>
              </legend>
              <div className="form-grid">
                {kinds.map((k) => (
                  <label key={k}>
                    {k}
                    <input type="date" name={k} />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="notice">
              Calendar + in-app reminders go to every active team member. Email
              is opt-in.
            </div>
          </ActionForm>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
