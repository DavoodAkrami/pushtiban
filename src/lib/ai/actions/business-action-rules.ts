export const businessActionWritesRecords = (actionKey: string) =>
  actionKey === "create_order" || actionKey === "create_reservation";

export const businessActionRequiresCollectionRequiredFieldValidation = (
  actionKey: string
) => businessActionWritesRecords(actionKey);
