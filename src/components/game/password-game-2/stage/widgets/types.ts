/**
 * The widget-output channel, forwarded from RuleList down to every interactive
 * payload renderer under stage/widgets/. A widget either types its answer into the
 * password (onWidgetText, routed through the same key path as the keyboard) or
 * publishes a non-text outcome to run state (onRuleState, read back by validators
 * via api.ruleState). Kept in its own module so the widgets and RuleList share the
 * shape without an import cycle.
 */
export interface WidgetChannel {
  onWidgetText(text: string): void;
  onRuleState(id: string, value: unknown): void;
}
