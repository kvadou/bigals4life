import Foundation
@main struct VoiceTests {
    static func main() throws {
        var count = 0
        func check(_ input: String, _ index: Int, _ added: [Int], night: Night = Night()) throws {
            let result = try VoiceRoll.parse(input, night: night)
            precondition(result.index == index && result.added == added, input)
            count += 1
        }
        func rejects(_ input: String, _ night: Night = Night()) {
            do { _ = try VoiceRoll.parse(input, night: night); fatalError(input) } catch { count += 1 }
        }
        try check("Doug got a strike!", 0, [10])
        try check("Kyle seven then spare", 2, [7, 3])
        try check("Pete six and zero", 3, [6,0])
        try check("Stafa knocked down nine pins", 1, [9])
        try check("Doug zero then spare", 0, [0,10])
        rejects("Doug zero then strike")
        rejects("Doug spare")
        rejects("Doug 200")
        rejects("Kyle six then six")
        rejects("Doug one then two then three")
        rejects("everyone strike")
        var night = Night(); night.finals = [180,nil,nil,nil]
        rejects("Doug strike", night)
        night = Night(); night.rolls[0] = Array(repeating: 10, count: 12)
        rejects("Doug strike", night)
        night.rolls[0] = Array(repeating: 0, count: 18) + [10,7]
        try check("Doug spare", 0, [3], night: night)
        rejects("Doug strike", night)
        night.rolls[0] = Array(repeating: 0, count: 18) + [10,10]
        try check("Doug strike", 0, [10], night: night)
        rejects("Doug spare", night)
        print("Voice entry: \(count) checks passed")
    }
}
