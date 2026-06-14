@suite-showcase
Feature: Cucumber Showcase

  # Background runs before every scenario in this feature file.
  # Use it for setup steps shared across all scenarios.
  Background:
    Given I am on the Sauce Demo login page

  # ── 1. Basic Scenario ──────────────────────────────────────────────────────
  # A simple linear flow. One path, one outcome.
  @test-showcase-1
  Scenario: Basic scenario — successful login
    When I log in with username "standard_user" and password "secret_sauce"
    Then I should see the products page

  # ── 2. Scenario Outline ────────────────────────────────────────────────────
  # Runs once per row in the Examples table.
  # Use <placeholder> in steps to reference column headers.
  @test-showcase-2
  Scenario Outline: Outline — login attempts with multiple users
    When I log in with username "<username>" and password "<password>"
    Then the login outcome should be "<outcome>"

    Examples:
      | username        | password     | outcome |
      | standard_user   | secret_sauce | success |
      | locked_out_user | secret_sauce | failure |
      | invalid_user    | wrong_pass   | failure |

  # ── 3. Data Table ──────────────────────────────────────────────────────────
  # Pass structured key-value data directly into a step.
  # In your step definition, access it via dataTable.hashes().
  @test-showcase-3
  Scenario: Data table — fill login form from a table
    When I fill in the login form:
      | field    | value         |
      | username | standard_user |
      | password | secret_sauce  |
    Then I should see the products page

  # ── 4. Doc String ──────────────────────────────────────────────────────────
  # Pass a multi-line string into a step using triple quotes.
  # Useful for payloads, messages, or any block of text.
  @test-showcase-4
  Scenario: Doc string — pass multi-line text to a step
    When I submit the following note:
      """
      This is a doc string.
      It can span multiple lines.
      Useful for JSON bodies, messages, or any block of text.
      """
    Then the note should be received
