@suite-login
Feature: Demo Sauce Login

  # Background runs before every scenario in this file
  Background:
    Given I am in Demo Sauce Login page

  # ── Basic Scenario ─────────────────────────────────────────────────────────
  @test-login-valid-credentials
  Scenario: Passing login test
    When I enter "standard_user" in username field
    And I enter "secret_sauce" in password field
    And I click on the login button
    Then I should be navigated to the products page

  @test-login-invalid-credentials
  Scenario: Failing login test
    When I enter "invalid_user" in username field
    And I enter "invalid_password" in password field
    And I click on the login button
    Then the login should fail

  # ── Scenario Outline ───────────────────────────────────────────────────────
  # Runs once per row in the Examples table.
  # Use <placeholder> in steps to reference column headers.
  @test-login-outline
  Scenario Outline: Login with multiple users
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
  @test-login-datatable
  Scenario: Login using a data table
    When I fill in the login form:
      | field    | value         |
      | username | standard_user |
      | password | secret_sauce  |
    Then I should be navigated to the products page
