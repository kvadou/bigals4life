import Foundation

struct BowlingGame: Codable, Equatable {
    private(set) var rolls: [Int] = []

    var frames: [[Int]] {
        var result: [[Int]] = []
        var index = 0
        for _ in 0..<9 {
            guard index < rolls.count else { return result }
            let count = rolls[index] == 10 ? 1 : min(2, rolls.count - index)
            result.append(Array(rolls[index..<(index + count)]))
            index += count
        }
        if index < rolls.count { result.append(Array(rolls[index...])) }
        return result
    }

    private func finished(_ frame: [Int], tenth: Bool) -> Bool {
        if tenth {
            return frame.count == 3 || (frame.count == 2 && frame.reduce(0, +) < 10)
        }
        return frame.first == 10 || frame.count == 2
    }

    var isComplete: Bool {
        frames.count == 10 && finished(frames[9], tenth: true)
    }

    var frameNumber: Int {
        guard let last = frames.last else { return 1 }
        return min(10, frames.count + (finished(last, tenth: frames.count == 10) ? 1 : 0))
    }

    var ballNumber: Int {
        guard let last = frames.last, !finished(last, tenth: frames.count == 10) else { return 1 }
        return last.count + 1
    }

    var pinsAvailable: Int {
        guard !isComplete else { return 0 }
        guard let last = frames.last, !finished(last, tenth: frames.count == 10) else { return 10 }
        if frames.count < 10 { return 10 - last[0] }
        if last.count == 1 { return last[0] == 10 ? 10 : 10 - last[0] }
        if last[0] < 10 || last[1] == 10 { return 10 }
        return 10 - last[1]
    }

    @discardableResult
    mutating func add(_ pins: Int) -> Bool {
        guard !isComplete, (0...pinsAvailable).contains(pins) else { return false }
        rolls.append(pins)
        return true
    }

    mutating func undo() { if !rolls.isEmpty { rolls.removeLast() } }

    var cumulativeScores: [Int?] {
        var result: [Int?] = []
        var index = 0
        var total = 0
        for frame in 0..<10 {
            guard index < rolls.count else { break }
            if frame == 9 {
                result.append(isComplete ? total + rolls[index...].reduce(0, +) : nil)
                break
            }
            if rolls[index] == 10 {
                if index + 2 < rolls.count {
                    total += 10 + rolls[index + 1] + rolls[index + 2]
                    result.append(total)
                } else { result.append(nil) }
                index += 1
            } else {
                guard index + 1 < rolls.count else { result.append(nil); break }
                let sum = rolls[index] + rolls[index + 1]
                if sum == 10 {
                    if index + 2 < rolls.count { total += 10 + rolls[index + 2]; result.append(total) }
                    else { result.append(nil) }
                } else { total += sum; result.append(total) }
                index += 2
            }
        }
        return result
    }

    var settledScore: Int { cumulativeScores.compactMap { $0 }.last ?? 0 }

    var maximumScore: Int {
        var projection = self
        while !projection.isComplete { projection.add(projection.pinsAvailable) }
        return projection.settledScore
    }

    func symbols(for frame: [Int]) -> String {
        frame.enumerated().map { index, pins in
            if (index == 1 || (index == 2 && frame[0] == 10)) && frame[index - 1] != 10 && frame[index - 1] + pins == 10 { return "/" }
            if pins == 10 { return "X" }
            return pins == 0 ? "–" : String(pins)
        }.joined(separator: "  ")
    }
}
