@suite-1
Feature: Demo Sauce Login

  @test-1
  Scenario: Passing login test
    Given I am in Demo Sauce Login page
    When I enter "standard_user" in username field
    And I enter "secret_sauce" in password field
    And I click on the login button
    Then I should be navigated to the products page

  @test-2
  Scenario: Failing login test
    Given I am in Demo Sauce Login page
    When I enter "invalid_user" in username field
    And I enter "invalid_password" in password field
    And I click on the login button
    Then I should be navigated to the products page