import { describe, expect, it } from "vitest";
import { validateEmail, validateName, validatePassword, validateTitle } from "@/lib/validation";

describe("валидация форм", () => {
  it("e-mail", () => {
    expect(validateEmail("a@b.ru")).toBeNull();
    expect(validateEmail("ab.ru")).not.toBeNull();
  });
  it("пароль: от 8 символов, буква и цифра", () => {
    expect(validatePassword("abcdefg1")).toBeNull();
    expect(validatePassword("abcdefgh")).not.toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
  });
  it("имя 1–50 символов", () => {
    expect(validateName("Аня")).toBeNull();
    expect(validateName(" ")).not.toBeNull();
    expect(validateName("x".repeat(51))).not.toBeNull();
  });
  it("название 1–100 символов", () => {
    expect(validateTitle("Конспект")).toBeNull();
    expect(validateTitle("x".repeat(101))).not.toBeNull();
  });
});
