SteppePlan — Linux build
========================

Запуск без установки:
  ./steppeplan

Установка в меню приложений:
  ./install.sh

После установки:
  steppeplan                 запуск
  steppeplan-mcp             MCP-сервер для агентов (stdio)
  steppeplan-update --manifest URL
  ./install.sh --rollback    откат на предыдущую версию

Данные лежат в ~/.steppeplan и не удаляются при обновлении.
Подробности: docs/UPDATES.md в репозитории.
