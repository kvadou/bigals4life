import Foundation

var checks = 0
func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    checks += 1
    precondition(condition(), message)
}
func game(_ rolls: [Int]) -> BowlingGame {
    var result = BowlingGame()
    for roll in rolls { expect(result.add(roll), "Invalid test roll \(roll)") }
    return result
}
expect(game([]).maximumScore == 300, "Fresh game")
expect(game([9]).maximumScore == 290, "First nine leaves spare ceiling")
expect(game([9, 0]).maximumScore == 279, "Open frame")
expect(game([10, 7]).maximumScore == 280, "Pending strike then seven")
expect(game(Array(repeating: 10, count: 12)).settledScore == 300, "Perfect game")
expect(game(Array(repeating: 0, count: 20)).settledScore == 0, "Gutters")
expect(game(Array(repeating: [9, 0], count: 10).flatMap { $0 }).settledScore == 90, "Nines")
expect(game(Array(repeating: 5, count: 21)).settledScore == 150, "All spares")
expect(game([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]).settledScore == 167, "Mixed game")
let nineGutters = Array(repeating: 0, count: 18)
var tenth = game(nineGutters + [10, 7])
expect(tenth.pinsAvailable == 3, "Tenth strike then seven leaves three")
expect(!tenth.add(4), "Reject impossible bonus")
expect(tenth.add(3) && tenth.isComplete && tenth.settledScore == 20, "Tenth bonus spare")
expect(!tenth.add(0), "Reject completed game roll")
tenth.undo()
expect(!tenth.isComplete && tenth.pinsAvailable == 3, "Undo bonus")
expect(game(nineGutters + [7, 3]).pinsAvailable == 10, "Tenth spare resets pins")
expect(game(nineGutters + [10, 10]).pinsAvailable == 10, "Tenth double resets pins")
expect(game([]).symbols(for: [7, 3, 7]) == "7  /  7", "Spare bonus uses fresh rack")
expect(game([]).symbols(for: [10, 7, 3]) == "X  7  /", "Strike bonus spare notation")
for _ in 0..<1000 {
    var current = BowlingGame()
    var ceiling = 300
    while !current.isComplete {
        expect(current.add(Int.random(in: 0...current.pinsAvailable)), "Legal random roll")
        expect(current.maximumScore <= ceiling, "Ceiling cannot increase")
        expect(current.maximumScore >= current.settledScore, "Ceiling bounds settled score")
        ceiling = current.maximumScore
    }
    expect(current.maximumScore == current.settledScore, "Final ceiling equals score")
}
print("Passed \(checks) bowling checks")
