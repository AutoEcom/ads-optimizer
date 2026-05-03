import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, currencyCode = "EUR", locale = "bg-BG") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/** Латински формат на валутата (напр. USD като „$“, без кирилски съкращения като „щ.д.“). */
export function formatCurrencyLatin(value: number, currencyCode = "EUR") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
