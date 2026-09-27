export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MAX_LENGTH = 128;

export type UserIdentity = {
  id: string;
  email: string;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > EMAIL_MAX_LENGTH) {
    return "请输入有效邮箱";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 1) {
    return "请输入密码";
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return "密码过长";
  }
  return null;
}
