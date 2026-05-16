/************************************************************
 * APPS SCRIPT ENTRYPOINTS
 * Thin global wrappers required by triggers, menus, and web apps.
 ************************************************************/

function doPost(e) {
  return Webhook.handle(e);
}

function onOpen() {
  return Main.onOpen();
}

function onEdit(e) {
  return Main.onEdit(e);
}

function updateGlobalDashboard() {
  return Dashboard.updateGlobalDashboard();
}

function applyFormatting() {
  return Sheet.applyFormatting();
}

function initializeProject() {
  return Main.initializeProject();
}

function refreshAccountBalances() {
  return Main.refreshAccountBalances();
}

function refreshCCBalances() {
  return Main.refreshCCBalances();
}

function resetRecurringStatus() {
  return Main.resetRecurringStatus();
}

function autoMonthlyReset() {
  return Main.autoMonthlyReset();
}
