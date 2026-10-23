"use client";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Field, IconButton } from "@/components/ui";
import s from "./auth.module.css";

export function PasswordField(props: { value: string; onChange(v: string): void; error?: string; placeholder?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className={s.pass}>
      <Field
        type={show ? "text" : "password"}
        label={props.placeholder ?? "Пароль"}
        autoComplete={props.autoComplete}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        error={props.error}
      />
      <span className={s.eye}>
        <IconButton tip={show ? "Скрыть" : "Показать"} onClick={() => setShow(!show)}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </IconButton>
      </span>
    </div>
  );
}
