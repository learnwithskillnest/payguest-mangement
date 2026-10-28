"use server";

import { revalidatePath } from "next/cache";
import { ExpenseCategory } from "@prisma/client";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { periodOf, today } from "@/lib/dates";
import { dateField, flash, optStr, rupeesField, str } from "@/lib/forms";
import { rupees } from "@/lib/money";

const CATS = Object.values(ExpenseCategory) as string[];

export async function addExpense(fd: FormData) {
  const { property } = await requireOwner();
  const date = dateField(fd, "date") ?? today();
  const back = `/expenses?month=${periodOf(date)}`;
  const amount = rupeesField(fd, "amount");
  const category = str(fd, "category");
  if (amount <= 0) flash(back, "error", "Enter the amount spent.");
  if (!CATS.includes(category)) flash(back, "error", "Choose a category.");
  await db.expense.create({
    data: {
      propertyId: property.id,
      category: category as ExpenseCategory,
      amount,
      date,
      paidTo: optStr(fd, "paidTo"),
      note: optStr(fd, "note"),
    },
  });
  revalidatePath("/expenses");
  flash(back, "msg", `${rupees(amount)} expense added.`);
}

export async function deleteExpense(fd: FormData) {
  const { property } = await requireOwner();
  const ex = await db.expense.findFirst({ where: { id: str(fd, "expenseId"), propertyId: property.id } });
  if (!ex) flash("/expenses", "error", "Expense not found.");
  await db.expense.delete({ where: { id: ex.id } });
  revalidatePath("/expenses");
  flash(`/expenses?month=${periodOf(ex.date)}`, "msg", "Expense deleted.");
}
