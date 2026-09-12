import Foundation

struct VoiceRoll: Equatable {
    let index: Int
    let added: [Int]
    let rolls: [Int]
    static func parse(_ transcript: String, night: Night) throws -> VoiceRoll {
        let text = transcript.lowercased().replacingOccurrences(of: "[.,!?]", with: "", options: .regularExpression).split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let words = text.split(separator: " ").map(String.init)
        guard let first = words.first, let index = Night.names.firstIndex(where: { $0.lowercased() == (first == "stafa" ? "mustafa" : first) }) else { throw ScorebookError.server("Say a bowler’s name and roll, like ‘Doug strike’ or ‘Kyle seven’.") }
        var phrase = words.dropFirst().joined(separator: " ")
        for prefix in ["knocked down ", "got ", "rolled ", "bowled ", "hit ", "scored "] where phrase.hasPrefix(prefix) { phrase.removeFirst(prefix.count); break }
        if phrase.hasPrefix("a ") { phrase.removeFirst(2) }
        phrase = phrase.replacingOccurrences(of: " pins?$", with: "", options: .regularExpression)
        let tokens = phrase.replacingOccurrences(of: " then ", with: "|").replacingOccurrences(of: " and ", with: "|").components(separatedBy: "|")
        let map = ["zero":"0","one":"1","two":"2","three":"3","four":"4","five":"5","six":"6","seven":"7","eight":"8","nine":"9","ten":"10","strike":"X","spare":"/","gutter":"0","miss":"0","foul":"0"]
        guard (1...2).contains(tokens.count), !night.current.complete(index) else { throw ScorebookError.server("Use one or two rolls for a bowler whose game is unfinished.") }
        var game = night.current.bowling(index)
        var added: [Int] = []
        for word in tokens {
            let token = map[word] ?? word
            let frame = game.frames.count >= game.frameNumber ? game.frames[game.frameNumber - 1] : []
            let value: Int
            if token == "/" {
                guard (frame.count == 1 && frame[0] != 10) || (game.frameNumber == 10 && frame.count == 2 && frame[0] == 10 && frame[1] != 10) else { throw ScorebookError.server("A spare needs the first ball of that rack.") }
                value = game.pinsAvailable
            } else if token == "X" {
                guard game.pinsAvailable == 10, !(frame.count == 1 && frame[0] != 10) else { throw ScorebookError.server("A strike needs a fresh rack. Say spare for the second ball.") }
                value = 10
            } else {
                guard token.range(of: "^(10|[0-9])$", options: .regularExpression) != nil, let pins = Int(token) else { throw ScorebookError.server("Use pins, strike or spare. For two rolls, say ‘Doug six then zero’. Running totals are not rolls.") }
                value = pins
            }
            guard game.add(value) else { throw ScorebookError.server("That roll is not possible in the current frame. Check the scorecard.") }
            added.append(value)
        }
        return VoiceRoll(index: index, added: added, rolls: game.rolls)
    }
}
