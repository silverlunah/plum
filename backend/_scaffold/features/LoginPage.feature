@suite-login
Feature: Demo Sauce Login

  # Background runs before every scenario in this file
  Background:
    Given I am in Demo Sauce Login page

  # ── Basic Scenario ─────────────────────────────────────────────────────────
  @test-1
  Scenario: User can log in with valid credentials
    When I enter "standard_user" in username field
    And I enter "secret_sauce" in password field
    And I click on the login button
    Then I should be navigated to the products page

  @test-2
  Scenario: User cannot log in with invalid credentials
    When I enter "invalid_user" in username field
    And I enter "invalid_password" in password field
    And I click on the login button
    Then the login should fail

  # ── Scenario Outline ───────────────────────────────────────────────────────
  # Runs once per row in the Examples table.
  # Use <placeholder> in steps to reference column headers.
  @test-3
  Scenario Outline: User login attempts with different credentials
    When I enter "<username>" in username field
    And I enter "<password>" in password field
    And I click on the login button
    Then the login outcome should be "<outcome>"

    Examples:
      | username        | password     | outcome |
      | standard_user   | secret_sauce | success |
      | locked_out_user | secret_sauce | failure |
      | invalid_user    | wrong_pass   | failure |

  # ── Data Table ─────────────────────────────────────────────────────────────
  # Pass structured data directly into a step.
  # Access rows in your step definition via dataTable.hashes().
  @test-4
  Scenario: User can log in using a data table
    When I fill in the login form:
      | field    | value         |
      | username | standard_user |
      | password | secret_sauce  |
    Then I should be navigated to the products page
