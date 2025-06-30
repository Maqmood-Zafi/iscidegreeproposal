# backend/app.py
from flask import Flask, request, jsonify
import pandas as pd
from flask_cors import CORS
import uuid
import time

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://iscidegreeproposal.vercel.app", 
            "http://127.0.0.1:5000",
            "http://localhost:3000",      # Add this
            "http://206.12.164.2:3000"    # Add this for network access
        ],
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
        "supports_credentials": True,
        "expose_headers": ["Content-Type"]
    }
})

# Dictionary to store user proposals by session ID
user_proposals = {}
# Track last activity time for cleanup
last_activity = {}
# Session timeout (24 hours)
SESSION_TIMEOUT = 86400

def get_user_proposal(session_id=None):
    """Get or create a proposal for the session"""
    # Use provided session ID or generate a new one
    if not session_id:
        session_id = str(uuid.uuid4())
    
    # Create new proposal if needed
    if session_id not in user_proposals:
        user_proposals[session_id] = DegreeProposal()
    
    # Update last activity time
    last_activity[session_id] = time.time()
    
    # Clean up inactive sessions occasionally
    if len(user_proposals) > 300 or (time.time() % 3600 < 10):
        cleanup_inactive_sessions()
        
    return session_id, user_proposals[session_id]

def cleanup_inactive_sessions():
    """Remove inactive sessions"""
    current_time = time.time()
    inactive_ids = [
        session_id for session_id, last_time in last_activity.items()
        if current_time - last_time > SESSION_TIMEOUT
    ]
    
    for session_id in inactive_ids:
        if session_id in user_proposals:
            del user_proposals[session_id]
        if session_id in last_activity:
            del last_activity[session_id]

class DegreeProposal:
    def __init__(self):
        try:
            # Read CSV and strip whitespace from column names
            self.courses_df = pd.read_csv('courses.csv')
            self.courses_df.columns = self.courses_df.columns.str.strip()
            
            # Convert columns to appropriate types
            self.courses_df['Course'] = self.courses_df['Course'].astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].astype(str)
            
            # Set default stream to regular
            self.stream = "regular"
            self.reset_proposal()
        except Exception as e:
            print(f"Error initializing DegreeProposal: {str(e)}")
            raise
        
    def reset_proposal(self):
        # Reset to initial state with only ISCI discipline
        self.disciplines = {"ISCI": []}
        self.discipline_order = ["ISCI"]  # Track order explicitly
    
    def set_stream(self, stream):
        """Set the degree stream (regular or honours)"""
        if stream in ["regular", "honours"]:
            self.stream = stream
            return True
        return False
    
    def add_discipline(self, discipline_name):
        if discipline_name not in self.disciplines:
            self.disciplines[discipline_name] = []
            self.discipline_order.append(discipline_name)  # Add to order
            return True
        return False
    
    def remove_discipline(self, discipline_name):
        print(f"Attempting to remove discipline: '{discipline_name}'")
        print(f"Current disciplines: {list(self.disciplines.keys())}")
        
        if discipline_name != "ISCI" and discipline_name in self.disciplines:
            del self.disciplines[discipline_name]
            self.discipline_order.remove(discipline_name)  # Remove from order
            print(f"Discipline '{discipline_name}' successfully removed")
            print(f"Disciplines after removal: {list(self.disciplines.keys())}")
            return True
        
        print(f"Failed to remove discipline '{discipline_name}'")
        return False
    
    def add_course(self, discipline_name, course_code):
        if discipline_name not in self.disciplines:
            return False
            
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code]
        if course_data.empty:
            return False
            
        # Check if course is already added to any discipline
        if any(course_code in courses for courses in self.disciplines.values()):
            return False
            
        # For ISCI discipline, only allow ISCI courses
        if discipline_name == "ISCI":
            isci_value = course_data.iloc[0]['isci_courses']
            if pd.isna(isci_value) or isci_value <= 0:
                return False
            
        self.disciplines[discipline_name].append(course_code)
        return True
    
    def remove_course(self, discipline_name, course_code):
        if discipline_name in self.disciplines:
            if course_code in self.disciplines[discipline_name]:
                self.disciplines[discipline_name].remove(course_code)
                return True
        return False

    def is_400_level(self, course_code):
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code].iloc[0]
        course_num = str(course_data['Course'])
        base_num = ''.join(filter(str.isdigit, course_num.split()[0]))
        return int(base_num) >= 400

    def get_course_credits(self, course_code):
        course_data = self.courses_df[self.courses_df['Course_code'] == course_code].iloc[0]
        
        # Get raw values from CSV
        science_value = course_data['science_credits']
        honorary_value = course_data['honorary_credits']
        isci_value = course_data['isci_courses']
        
        return {
            'discipline_credit': float(course_data['discipline_credit']),
            # Only count as science credit if the science_credits column has a value
            'science_credit': not pd.isna(science_value) and science_value > 0,
            'science_value': float(science_value) if not pd.isna(science_value) else 0,
            'isci_course': not pd.isna(isci_value) and isci_value > 0,
            'isci_value': float(isci_value) if not pd.isna(isci_value) else 0,
            'honorary_credit': not pd.isna(honorary_value) and honorary_value > 0,
            'honorary_value': float(honorary_value) if not pd.isna(honorary_value) else 0
        }

    def validate_proposal(self):
        # Set requirements based on stream
        if self.stream == "honours":
            discipline_min_credits = 12
            isci_min_credits = 13
            total_credits_required = 42
            science_credits_required = 49
            max_honorary_credits = 7
            non_isci_science_required = 27
            total_400_level_required = 18
            require_isci_449 = True
        else:  # regular stream
            discipline_min_credits = 9
            isci_min_credits = 7
            total_credits_required = 33
            science_credits_required = 40
            max_honorary_credits = 10
            non_isci_science_required = 27
            total_400_level_required = 12
            require_isci_449 = False
        
        validation_results = {
            'success': True,
            'messages': [],
            'total_credits': 0,
            'science_credits': 0,
            'isci_credits': 0,
            'honorary_credits': 0,
            'total_400_level_credits': 0,
            'disciplines_400_level': {},
            'non_isci_science_credits': 0,
            'non_isci_honorary_credits': 0,
            'stream': self.stream,
            'requirements': {
                'discipline_count': { 'required': '2-3', 'actual': 0, 'met': False },
                'isci_credits': { 'required': isci_min_credits, 'actual': 0, 'met': False },
                'total_credits': { 'required': total_credits_required, 'actual': 0, 'met': False },
                'science_credits': { 'required': science_credits_required, 'actual': 0, 'met': False },
                'non_isci_science_credits': { 'required': non_isci_science_required, 'actual': 0, 'met': False },
                'honorary_credits': { 'required': f'≤ {max_honorary_credits}', 'actual': 0, 'met': True },
                'total_400_level': { 'required': total_400_level_required, 'actual': 0, 'met': False },
                'disciplines_requirements': {}
            }
        }

        # --- Initial Validation Checks ---
        isci_courses = self.disciplines.get("ISCI", [])
        has_isci_449 = "ISCI 449" in isci_courses

        non_isci_disciplines = [d for d in self.disciplines.keys() if d != "ISCI"]
        validation_results['requirements']['discipline_count']['actual'] = len(non_isci_disciplines)
        validation_results['requirements']['discipline_count']['met'] = 2 <= len(non_isci_disciplines) <= 3
        if not validation_results['requirements']['discipline_count']['met']:
            validation_results['success'] = False
            validation_results['messages'].append("Must have 2-3 disciplines (excluding ISCI)")

        if require_isci_449 and not has_isci_449:
            validation_results['success'] = False
            validation_results['messages'].append("Honours stream requires ISCI 449 course")

        # --- Credit Calculation Loop ---
        total_credits = 0
        pure_non_isci_science_credits = 0
        isci_science_credits = 0
        honorary_courses = []
        total_400_level_credits = 0

        for discipline in self.discipline_order:
            if discipline not in self.disciplines: continue
            courses = self.disciplines[discipline]
            
            discipline_credits = 0
            discipline_400_level_credits = 0
            
            for course in courses:
                credits = self.get_course_credits(course)
                discipline_credits += credits['discipline_credit']
                
                if self.is_400_level(course):
                    if discipline != "ISCI":
                        total_400_level_credits += credits['discipline_credit']
                    discipline_400_level_credits += credits['discipline_credit']

                if discipline == "ISCI":
                    if credits['isci_course']:
                        isci_science_credits += credits['isci_value'] or credits['discipline_credit']
                else: # Non-ISCI disciplines
                    # This logic prevents double-counting. A course is either honorary or pure science.
                    if credits['honorary_credit']:
                        honorary_courses.append({
                            'course': course,
                            'credit': credits['honorary_value']
                        })
                    elif credits['science_credit']:
                        pure_non_isci_science_credits += credits['science_value']
            
            if discipline != "ISCI":
                total_credits += discipline_credits

            # --- Per-Discipline Requirement Checks ---
            is_isci_discipline = discipline == "ISCI"
            min_credits_for_discipline = isci_min_credits if is_isci_discipline else discipline_min_credits
            
            discipline_met = discipline_credits >= min_credits_for_discipline
            if is_isci_discipline and require_isci_449:
                discipline_met = discipline_met and has_isci_449

            has_400_level_met = True
            if not is_isci_discipline:
                has_400_level_met = discipline_400_level_credits > 0
                if not has_400_level_met:
                    validation_results['success'] = False
                    validation_results['messages'].append(f"Discipline {discipline} must have at least one 400-level course")

            validation_results['requirements']['disciplines_requirements'][discipline] = {
                'course_count': { 'required': min_credits_for_discipline, 'actual': discipline_credits, 'met': discipline_met },
                'has_400_level': { 'required': True, 'actual': discipline_400_level_credits > 0, 'met': has_400_level_met }
            }
            if not discipline_met:
                validation_results['success'] = False
                if is_isci_discipline and require_isci_449 and not has_isci_449:
                    validation_results['messages'].append(f"Discipline ISCI requires ISCI 449 for honours stream")
                else:
                    validation_results['messages'].append(f"Discipline {discipline} needs at least {min_credits_for_discipline} credits")

        # --- Final Overall Requirement Checks ---
        honorary_credits_used = 0
        honorary_credits_available = 0
        for course_info in honorary_courses:
            honorary_credits_available += course_info['credit']
            if honorary_credits_used + course_info['credit'] <= max_honorary_credits:
                honorary_credits_used += course_info['credit']
        
        total_science = isci_science_credits + pure_non_isci_science_credits + honorary_credits_used
        non_isci_science_total = pure_non_isci_science_credits + honorary_credits_used
        
        # Update actual values in validation_results
        validation_results['total_credits'] = total_credits
        validation_results['science_credits'] = total_science
        validation_results['isci_credits'] = isci_science_credits
        validation_results['non_isci_science_credits'] = non_isci_science_total
        validation_results['honorary_credits'] = honorary_credits_available
        validation_results['non_isci_honorary_credits'] = honorary_credits_available
        validation_results['total_400_level_credits'] = total_400_level_credits

        # Update requirement status ('met' boolean)
        reqs = validation_results['requirements']
        reqs['isci_credits']['actual'] = isci_science_credits
        reqs['isci_credits']['met'] = reqs['isci_credits']['actual'] >= reqs['isci_credits']['required']

        reqs['total_credits']['actual'] = total_credits
        reqs['total_credits']['met'] = reqs['total_credits']['actual'] >= reqs['total_credits']['required']

        reqs['science_credits']['actual'] = total_science
        reqs['science_credits']['met'] = reqs['science_credits']['actual'] >= reqs['science_credits']['required']

        reqs['non_isci_science_credits']['actual'] = non_isci_science_total
        reqs['non_isci_science_credits']['met'] = reqs['non_isci_science_credits']['actual'] >= reqs['non_isci_science_credits']['required']

        reqs['honorary_credits']['actual'] = honorary_credits_available
        reqs['honorary_credits']['met'] = reqs['honorary_credits']['actual'] <= max_honorary_credits

        reqs['total_400_level']['actual'] = total_400_level_credits
        reqs['total_400_level']['met'] = reqs['total_400_level']['actual'] >= reqs['total_400_level']['required']

        # Update overall success and messages based on new 'met' status
        if not reqs['total_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append(f"Need at least {total_credits_required} total credits in non-ISCI disciplines")
        if not reqs['science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append(f"Need at least {science_credits_required} total science credits")
        if not reqs['non_isci_science_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append(f"Need at least {non_isci_science_required} science credits from non-ISCI disciplines")
        if not reqs['honorary_credits']['met']:
            validation_results['success'] = False
            validation_results['messages'].append(f"Cannot have more than {max_honorary_credits} honorary credits")
        if not reqs['total_400_level']['met']:
            validation_results['success'] = False
            validation_results['messages'].append(f"Need at least {total_400_level_required} credits from 400-level non-ISCI courses")

        return validation_results

    def search_courses(self, query, limit=10):
        if not query or len(query) < 2:
            return []
            
        query = query.lower()
        try:
            # Convert columns to string and handle NaN values
            self.courses_df['Course'] = self.courses_df['Course'].fillna('').astype(str)
            self.courses_df['Course_code'] = self.courses_df['Course_code'].fillna('').astype(str)
            self.courses_df['Title'] = self.courses_df['Title'].fillna('').astype(str)
            
            # Search using string methods
            mask = (
                self.courses_df['Course_code'].str.lower().str.contains(query, na=False) | 
                self.courses_df['Title'].str.lower().str.contains(query, na=False)
            )
            matched_courses = self.courses_df[mask]
            
            # Sort by exact matches first
            matched_courses = matched_courses.sort_values(
                by='Course_code',
                key=lambda x: x.str.lower().str.startswith(query).astype(int),
                ascending=False
            )
            
            # Return limited results
            results = matched_courses.head(limit).to_dict('records')
            return [{'code': str(r['Course_code']), 'name': str(r['Title'])} for r in results]
        except Exception as e:
            print(f"Error in search_courses: {str(e)}")
            return []



@app.route('/reset', methods=['POST'])
def reset_proposal():
    try:
        # Get session_id from query parameter or create new one
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        proposal.reset_proposal()
        return jsonify({
            'success': True,
            'message': 'Proposal reset successfully',
            'session_id': session_id
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/disciplines', methods=['POST'])
def add_discipline():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    data = request.json
    success = proposal.add_discipline(data['discipline_name'])
    
    # Return updated validation after adding discipline
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    return jsonify({
        'success': success,
        'session_id': session_id
    })

@app.route('/disciplines/<discipline_name>', methods=['DELETE'])
def remove_discipline(discipline_name):
    # Get session_id from query parameter
    session_id = request.args.get('session')
    print(f"DELETE discipline request: '{discipline_name}', session: {session_id}")
    
    session_id, proposal = get_user_proposal(session_id)
    success = proposal.remove_discipline(discipline_name)
    
    # Return updated validation after removing discipline
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    
    return jsonify({
        'success': success,
        'message': f"Could not remove '{discipline_name}' (not found or protected)",
        'session_id': session_id
    })

@app.route('/courses', methods=['POST'])
def add_course():
    try:
        # Get session_id from query parameter
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        data = request.json
        success = proposal.add_course(data['discipline_name'], data['course_code'])
        
        if success:
            course_data = proposal.courses_df[
                proposal.courses_df['Course_code'] == data['course_code']
            ].iloc[0]
            
            results = proposal.validate_proposal()
            return jsonify({
                'success': success,
                'validation': results,
                'course': {
                    'code': data['course_code'],
                    'title': course_data['Title']
                },
                'session_id': session_id
            })
        else:
            # Check why the course couldn't be added
            course_data = proposal.courses_df[
                proposal.courses_df['Course_code'] == data['course_code']
            ]
            if not course_data.empty:
                isci_course = not pd.isna(course_data.iloc[0]['isci_courses']) and course_data.iloc[0]['isci_courses'] > 0
                if data['discipline_name'] == "ISCI" and not isci_course:
                    return jsonify({
                        'success': False,
                        'message': 'Only ISCI courses can be added to the ISCI discipline',
                        'session_id': session_id
                    })
                        
            return jsonify({
                'success': False,
                'session_id': session_id
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/courses', methods=['DELETE'])
def remove_course():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    data = request.json
    success = proposal.remove_course(data['discipline_name'], data['course_code'])
    
    # Return updated validation after removing course
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': success, 
            'validation': results,
            'session_id': session_id
        })
    return jsonify({
        'success': success,
        'session_id': session_id
    })

@app.route('/validate', methods=['GET'])
def validate_proposal():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    results = proposal.validate_proposal()
    return jsonify({
        **results,
        'session_id': session_id
    })

@app.route('/search-courses', methods=['GET'])
def search_courses():
    try:
        # Get session_id from query parameter
        session_id = request.args.get('session')
        session_id, proposal = get_user_proposal(session_id)
        
        query = request.args.get('query', '')
        results = proposal.search_courses(query)
        return jsonify({
            'results': results,
            'session_id': session_id
        })
    except Exception as e:
        print(f"Search endpoint error: {str(e)}")
        return jsonify({
            'results': [],
            'session_id': session_id if 'session_id' in locals() else None
        })

@app.route('/proposal-state', methods=['GET'])
def get_proposal_state():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    # Return the complete proposal state including discipline order
    return jsonify({
        'disciplines': proposal.disciplines,
        'discipline_order': proposal.discipline_order,  # Send explicit order
        'stream': proposal.stream,
        'session_id': session_id
    })

@app.route('/set-stream', methods=['POST'])
def set_stream():
    # Get session_id from query parameter
    session_id = request.args.get('session')
    session_id, proposal = get_user_proposal(session_id)
    
    data = request.json
    stream = data.get('stream', 'regular')
    
    success = proposal.set_stream(stream)
    
    if success:
        results = proposal.validate_proposal()
        return jsonify({
            'success': True, 
            'validation': results,
            'session_id': session_id
        })
    
    return jsonify({
        'success': False,
        'message': 'Invalid stream selection',
        'session_id': session_id
    })

if __name__ == '__main__':
    app.run(debug=True)

